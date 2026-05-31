// Benni Scene Presets - custom panel (framework-free web component).
//
// Browse-first layout (Targets + Tunables on top, categorised apply-tiles below),
// plus editors for custom scenes and looks, and a string-based import/export.
// Talks to the integration over the benni_scene_presets/* WebSocket commands.
// Identity is slug/name based (no UUIDs). Brightness defaults to the policy /
// day phase; the Tunables here are for manual testing from the panel.

const DOMAIN = "benni_scene_presets";
const MAX_COLORS = 10;
const FAV_KEY = "bsp_favorites";

const slugify = (name) =>
  ((name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")) || "scene";

class BenniScenePresetsPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._initialized = false;
    this._presets = [];
    this._looks = [];
    this._aqara = [];
    this._view = "browse"; // browse | scene | look | io | aqara
    this._editing = this._blankScene();
    this._editingLook = this._blankLook();
    this._editingAqara = this._blankAqara();
    this._targets = [];
    this._tunables = { dynamic: false, shuffle: false, customBri: false, brightness: 128, customTrans: false, transition: 2 };
    this._favs = this._loadFavs();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._initialized) {
      this._initialized = true;
      this._renderShell();
      this._refresh();
    }
  }
  get hass() { return this._hass; }

  _blankScene() {
    return { slug: null, name: "", category: "", img: null, colors: ["#ff8800"], interval: 300, transition: 60, shuffle: true };
  }
  _blankBinding() {
    return { kind: "scene", entity_ids: [], scene: "", interval: "", transition: "",
      aqara: "", service: "aqara_advanced_lighting.set_dynamic_effect", effect: "" };
  }
  _blankLook() {
    return { slug: null, name: "", bindings: [this._blankBinding()] };
  }
  _blankAqara() {
    return { slug: null, name: "", service: "start_dynamic_scene", preset: "", brightness: "" };
  }

  _loadFavs() { try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]")); } catch { return new Set(); } }
  _saveFavs() { localStorage.setItem(FAV_KEY, JSON.stringify([...this._favs])); }

  // ---- data ----------------------------------------------------------------

  async _refresh() {
    try {
      const data = await this._hass.callWS({ type: `${DOMAIN}/list_presets` });
      this._presets = (data.presets || []).filter((p) => p.custom);
    } catch (err) {
      this._presets = [];
      this._toast(`Could not load scenes: ${err.message || err}`);
    }
    try {
      const data = await this._hass.callWS({ type: `${DOMAIN}/list_looks` });
      this._looks = data.looks || [];
    } catch { this._looks = []; }
    try {
      const data = await this._hass.callWS({ type: `${DOMAIN}/list_aqara` });
      this._aqara = data.aqara || [];
    } catch { this._aqara = []; }
    this._render();
  }

  // ---- aqara CRUD ----------------------------------------------------------

  async _saveAqara() {
    const a = this._editingAqara;
    if (!a.name.trim()) { this._toast("Name the Aqara preset."); return; }
    if (!a.preset.trim()) { this._toast("Enter the Aqara preset name (from the Aqara app)."); return; }
    const data = { preset: a.preset.trim() };
    if (a.brightness !== "" && a.brightness != null) data.brightness = Number(a.brightness);
    const msg = { type: `${DOMAIN}/save_aqara`, name: a.name.trim(), service: a.service, data };
    if (a.slug) msg.slug = a.slug;
    try {
      await this._hass.callWS(msg);
      this._toast("Aqara preset saved.");
      this._editingAqara = this._blankAqara();
      this._view = "browse";
      await this._refresh();
    } catch (err) { this._toast(`Save failed: ${err.message || err}`); }
  }

  async _deleteAqara(slug) {
    if (!confirm("Delete this Aqara preset?")) return;
    try { await this._hass.callWS({ type: `${DOMAIN}/delete_aqara`, slug }); this._toast("Deleted."); this._refresh(); }
    catch (err) { this._toast(`Delete failed: ${err.message || err}`); }
  }

  _editAqara(item) {
    const d = item.data || {};
    this._editingAqara = {
      slug: item.slug, name: item.name || "", service: item.service || "start_dynamic_scene",
      preset: d.preset || "", brightness: d.brightness != null ? d.brightness : "",
    };
    this._view = "aqara";
    this._render();
  }

  _lights() {
    return Object.keys(this._hass.states || {}).filter((id) => id.startsWith("light.")).sort();
  }

  // Selectable targets: individual lights + light groups. Groups are either
  // HA group.* entities or benni_core_devices' sensor.benni_light_group_* (whose
  // members live in the entity_id attribute).
  _targetEntities() {
    const states = this._hass.states || {};
    const groups = Object.keys(states)
      .filter((id) => id.startsWith("group.") || id.startsWith("sensor.benni_light_group_"))
      .sort()
      .map((id) => ({ id, label: (states[id].attributes && states[id].attributes.friendly_name) || id, group: true }));
    const lights = this._lights().map((id) => ({ id, label: id, group: false }));
    return { groups, lights };
  }

  // Expand any benni_light_group sensor to its member entities; pass the rest
  // (lights, group.*) straight through — the backend resolves group.* itself.
  _expandList(ids) {
    const states = this._hass.states || {};
    const out = [];
    for (const id of ids) {
      if (id.startsWith("sensor.benni_light_group_")) {
        const members = states[id] && states[id].attributes && states[id].attributes.entity_id;
        if (members) out.push(...[].concat(members));
      } else {
        out.push(id);
      }
    }
    return [...new Set(out)];
  }

  _resolveTargets() {
    return this._expandList(this._targets);
  }

  // ---- apply (browse) ------------------------------------------------------

  async _applyScene(scene) {
    const entity_id = this._resolveTargets();
    if (!entity_id.length) { this._toast("Pick one or more targets first."); return; }
    const t = this._tunables;
    const data = { targets: { entity_id } };
    if (t.customBri) data.brightness = Number(t.brightness);
    if (t.customTrans) data.transition = Number(t.transition);
    try {
      if (t.dynamic) {
        data.preset = scene.slug;
        data.interval = scene.interval != null ? scene.interval : 300;
        await this._hass.callService(DOMAIN, "start_dynamic_scene", data);
      } else {
        data.preset = scene.slug;
        data.shuffle = !!t.shuffle;
        await this._hass.callService(DOMAIN, "apply_preset", data);
      }
      this._toast(`Applied "${scene.name}".`);
    } catch (err) { this._toast(`Apply failed: ${err.message || err}`); }
  }

  async _applyLook(look) {
    const data = { look: look.slug };
    if (this._tunables.customBri) data.brightness = Number(this._tunables.brightness);
    try {
      await this._hass.callService(DOMAIN, "apply_look", data);
      this._toast(`Look "${look.name}" applied.`);
    } catch (err) { this._toast(`Apply failed: ${err.message || err}`); }
  }

  _toggleFav(slug, ev) {
    ev.stopPropagation();
    if (this._favs.has(slug)) this._favs.delete(slug); else this._favs.add(slug);
    this._saveFavs();
    this._render();
  }

  // ---- scene CRUD ----------------------------------------------------------

  async _saveScene() {
    const s = this._editing;
    if (!s.name.trim()) { this._toast("Please enter a name."); return; }
    if (!s.colors.length) { this._toast("Add at least one colour."); return; }
    const msg = {
      type: `${DOMAIN}/save_preset`, name: s.name.trim(), category: s.category || null,
      colors: s.colors, interval: Number(s.interval), transition: Number(s.transition), shuffle: !!s.shuffle,
    };
    if (s.slug) msg.slug = s.slug;
    if (s.img) msg.img = s.img;
    try {
      const saved = await this._hass.callWS(msg);
      this._toast("Saved.");
      if (this._pendingQuickLook) { await this._quickLook(saved); this._pendingQuickLook = false; }
      this._editing = this._blankScene();
      this._view = "browse";
      await this._refresh();
    } catch (err) { this._toast(`Save failed: ${err.message || err}`); }
  }

  async _quickLook(scene) {
    // One-binding look: all current targets (or all lights) -> this scene.
    const ents = this._targets.length ? this._resolveTargets() : this._lights();
    try {
      await this._hass.callWS({
        type: `${DOMAIN}/save_look`, name: scene.name,
        bindings: [{ kind: "scene", targets: { entity_id: ents }, scene: scene.slug }],
      });
      this._toast(`Quick-look "${scene.name}" created.`);
    } catch (err) { this._toast(`Quick-look failed: ${err.message || err}`); }
  }

  async _deleteScene(slug) {
    if (!confirm("Delete this scene?")) return;
    try { await this._hass.callWS({ type: `${DOMAIN}/delete_preset`, slug }); this._toast("Deleted."); this._refresh(); }
    catch (err) { this._toast(`Delete failed: ${err.message || err}`); }
  }

  _editScene(scene) {
    this._editing = {
      slug: scene.slug, name: scene.name || "", category: scene.category || "", img: scene.img || null,
      colors: (scene.lights || []).map((l) => l.hex || "#ffffff"),
      interval: scene.interval != null ? scene.interval : 300,
      transition: scene.transition != null ? scene.transition : 60,
      shuffle: scene.shuffle != null ? scene.shuffle : true,
    };
    if (!this._editing.colors.length) this._editing.colors = ["#ff8800"];
    this._view = "scene";
    this._render();
  }

  async _previewColors(colors) {
    const entity_id = this._resolveTargets();
    if (!entity_id.length) { this._toast("Pick a target to preview on."); return; }
    try {
      await this._hass.callWS({ type: `${DOMAIN}/apply_preview`, targets: { entity_id }, colors, transition: 1 });
    } catch (err) { this._toast(`Preview failed: ${err.message || err}`); }
  }

  async _uploadImage(file) {
    const form = new FormData();
    form.append("file", file);
    try {
      const resp = await fetch(`/api/${DOMAIN}/upload_image`, {
        method: "POST", body: form, headers: { Authorization: `Bearer ${this._hass.auth.data.access_token}` },
      });
      if (!resp.ok) throw new Error(await resp.text());
      const json = await resp.json();
      this._editing.img = json.img;
      this._render();
      this._toast("Image uploaded.");
    } catch (err) { this._toast(`Upload failed: ${err.message || err}`); }
  }

  // ---- look CRUD -----------------------------------------------------------

  async _saveLook() {
    const l = this._editingLook;
    if (!l.name.trim()) { this._toast("Name the look."); return; }
    const bindings = l.bindings.map((b) => {
      const entity_id = this._expandList(b.entity_ids);
      if (b.kind === "aqara") {
        if (!entity_id.length || !b.aqara) return null;
        return { kind: "aqara", targets: { entity_id }, aqara: b.aqara };
      }
      if (b.kind === "effect") {
        if (!entity_id.length || !b.service || !b.effect) return null;
        return { kind: "effect", targets: { entity_id }, service: b.service, data: { effect: b.effect } };
      }
      if (!entity_id.length || !b.scene) return null;
      return {
        kind: "scene", targets: { entity_id }, scene: b.scene,
        interval: b.interval === "" ? null : Number(b.interval),
        transition: b.transition === "" ? null : Number(b.transition),
      };
    }).filter(Boolean);
    if (!bindings.length) { this._toast("Add at least one complete binding."); return; }
    const msg = { type: `${DOMAIN}/save_look`, name: l.name.trim(), bindings };
    if (l.slug) msg.slug = l.slug;
    try {
      await this._hass.callWS(msg);
      this._toast("Look saved.");
      this._editingLook = this._blankLook();
      this._view = "browse";
      await this._refresh();
    } catch (err) { this._toast(`Save failed: ${err.message || err}`); }
  }

  async _deleteLook(slug) {
    if (!confirm("Delete this look?")) return;
    try { await this._hass.callWS({ type: `${DOMAIN}/delete_look`, slug }); this._toast("Deleted."); this._refresh(); }
    catch (err) { this._toast(`Delete failed: ${err.message || err}`); }
  }

  _editLook(look) {
    this._editingLook = {
      slug: look.slug, name: look.name || "",
      bindings: (look.bindings || []).map((b) => ({
        kind: b.kind || "scene",
        entity_ids: b.targets && b.targets.entity_id ? [].concat(b.targets.entity_id) : [],
        scene: b.scene || b.scene_id || "",
        interval: b.interval != null ? b.interval : "",
        transition: b.transition != null ? b.transition : "",
        aqara: b.aqara || "",
        service: b.service || "aqara_advanced_lighting.set_dynamic_effect",
        effect: (b.data && b.data.effect) || "",
      })),
    };
    if (!this._editingLook.bindings.length) this._editingLook.bindings = [this._blankBinding()];
    this._view = "look";
    this._render();
  }

  // ---- import / export -----------------------------------------------------

  _exportScene(scene) {
    const payload = { n: scene.name, cat: scene.category || "", c: (scene.lights || []).map((l) => l.hex || "#ffffff"),
      i: scene.interval, t: scene.transition, s: scene.shuffle };
    const str = "BSP1:" + btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    this._view = "io"; this._ioString = str; this._render();
    this._toast("Export string ready — copy it below.");
  }

  _importString(str) {
    try {
      str = (str || "").trim();
      if (!str.startsWith("BSP1:")) throw new Error("Not a BSP1 string");
      const p = JSON.parse(decodeURIComponent(escape(atob(str.slice(5)))));
      this._editing = {
        slug: null, name: p.n || "", category: p.cat || "", img: null,
        colors: (p.c && p.c.length ? p.c : ["#ff8800"]).slice(0, MAX_COLORS),
        interval: p.i != null ? p.i : 300, transition: p.t != null ? p.t : 60, shuffle: p.s != null ? p.s : true,
      };
      this._view = "scene"; this._render();
      this._toast("Imported into the editor — review and create.");
    } catch (err) { this._toast(`Import failed: ${err.message || err}`); }
  }

  // ---- rendering -----------------------------------------------------------

  _renderShell() {
    this.shadowRoot.innerHTML = `<style>${this._css()}</style><div id="root"></div><div id="toast"></div>`;
    this._render();
  }

  _render() {
    const root = this.shadowRoot.getElementById("root");
    if (!root) return;
    if (this._view === "scene") return this._renderSceneEditor(root);
    if (this._view === "look") return this._renderLookEditor(root);
    if (this._view === "aqara") return this._renderAqaraEditor(root);
    if (this._view === "io") return this._renderIO(root);
    this._renderBrowse(root);
  }

  _renderBrowse(root) {
    const { groups, lights } = this._targetEntities();
    root.innerHTML = `
      <div class="topbar">
        <h1>Benni Scene Presets</h1>
        <div class="actions">
          <button id="a-scene">+ Create Custom</button>
          <button id="a-aqara" class="secondary">+ Create Aqara</button>
          <button id="a-look" class="secondary">+ Create Look</button>
          <button id="a-io" class="secondary">Import / Export</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Targets</div>
        <div class="hint" style="margin-bottom:6px">Pick lights and/or groups (multiple allowed).</div>
        <div id="targets" class="targets-box">
          ${groups.length ? `<div class="tgt-head">Groups</div>` : ""}
          ${groups.map((g) => `<label class="tgt"><input type="checkbox" data-tgt="${g.id}" ${this._targets.includes(g.id) ? "checked" : ""}> ${g.label} <span class="hint">(group)</span></label>`).join("")}
          ${groups.length ? `<div class="tgt-head">Lights</div>` : ""}
          ${lights.map((l) => `<label class="tgt"><input type="checkbox" data-tgt="${l.id}" ${this._targets.includes(l.id) ? "checked" : ""}> ${l.label}</label>`).join("")}
        </div>
        <div class="card-title" style="margin-top:14px">Tunables <span class="hint">(for manual testing — brightness usually comes from the policy)</span></div>
        <div class="tun">
          <label><input type="checkbox" id="t-dyn" ${this._tunables.dynamic ? "checked" : ""}> Dynamic (cycle)</label>
          <label><input type="checkbox" id="t-shuf" ${this._tunables.shuffle ? "checked" : ""}> Shuffle colours</label>
          <label><input type="checkbox" id="t-cbri" ${this._tunables.customBri ? "checked" : ""}> Custom brightness</label>
          <input type="range" id="t-bri" min="1" max="255" value="${this._tunables.brightness}" ${this._tunables.customBri ? "" : "disabled"}>
          <span class="mono">${this._tunables.brightness}</span>
          <label><input type="checkbox" id="t-ctrans" ${this._tunables.customTrans ? "checked" : ""}> Custom transition</label>
          <input type="number" id="t-trans" min="0" max="300" value="${this._tunables.transition}" ${this._tunables.customTrans ? "" : "disabled"} style="width:70px">
        </div>
      </div>

      ${this._renderSceneSections()}
      ${this._renderAqaraSection()}
      ${this._renderLookSection()}
    `;

    root.querySelectorAll("#targets [data-tgt]").forEach((cb) => cb.addEventListener("change", (e) => {
      const id = e.target.dataset.tgt;
      if (e.target.checked) { if (!this._targets.includes(id)) this._targets.push(id); }
      else { this._targets = this._targets.filter((x) => x !== id); }
    }));
    const bind = (id, ev, fn) => root.querySelector(id).addEventListener(ev, fn);
    bind("#a-scene", "click", () => { this._editing = this._blankScene(); this._view = "scene"; this._render(); });
    bind("#a-aqara", "click", () => { this._editingAqara = this._blankAqara(); this._view = "aqara"; this._render(); });
    bind("#a-look", "click", () => { this._editingLook = this._blankLook(); this._view = "look"; this._render(); });
    bind("#a-io", "click", () => { this._ioString = ""; this._view = "io"; this._render(); });
    bind("#t-dyn", "change", (e) => { this._tunables.dynamic = e.target.checked; });
    bind("#t-shuf", "change", (e) => { this._tunables.shuffle = e.target.checked; });
    bind("#t-cbri", "change", (e) => { this._tunables.customBri = e.target.checked; this._render(); });
    bind("#t-bri", "input", (e) => { this._tunables.brightness = e.target.value; e.target.nextElementSibling.textContent = e.target.value; });
    bind("#t-ctrans", "change", (e) => { this._tunables.customTrans = e.target.checked; this._render(); });
    bind("#t-trans", "input", (e) => { this._tunables.transition = e.target.value; });

    root.querySelectorAll("[data-apply]").forEach((el) =>
      el.addEventListener("click", () => this._applyScene(this._presets.find((p) => p.slug === el.dataset.apply))));
    root.querySelectorAll("[data-edit]").forEach((el) =>
      el.addEventListener("click", (e) => { e.stopPropagation(); this._editScene(this._presets.find((p) => p.slug === el.dataset.edit)); }));
    root.querySelectorAll("[data-del]").forEach((el) =>
      el.addEventListener("click", (e) => { e.stopPropagation(); this._deleteScene(el.dataset.del); }));
    root.querySelectorAll("[data-exp]").forEach((el) =>
      el.addEventListener("click", (e) => { e.stopPropagation(); this._exportScene(this._presets.find((p) => p.slug === el.dataset.exp)); }));
    root.querySelectorAll("[data-fav]").forEach((el) =>
      el.addEventListener("click", (e) => this._toggleFav(el.dataset.fav, e)));
    root.querySelectorAll("[data-applylook]").forEach((el) =>
      el.addEventListener("click", () => this._applyLook(this._looks.find((l) => l.slug === el.dataset.applylook))));
    root.querySelectorAll("[data-editlook]").forEach((el) =>
      el.addEventListener("click", (e) => { e.stopPropagation(); this._editLook(this._looks.find((l) => l.slug === el.dataset.editlook)); }));
    root.querySelectorAll("[data-dellook]").forEach((el) =>
      el.addEventListener("click", (e) => { e.stopPropagation(); this._deleteLook(el.dataset.dellook); }));
    root.querySelectorAll("[data-editaqara]").forEach((el) =>
      el.addEventListener("click", (e) => { e.stopPropagation(); this._editAqara(this._aqara.find((a) => a.slug === el.dataset.editaqara)); }));
    root.querySelectorAll("[data-delaqara]").forEach((el) =>
      el.addEventListener("click", (e) => { e.stopPropagation(); this._deleteAqara(el.dataset.delaqara); }));
  }

  _renderAqaraSection() {
    if (!this._aqara.length) {
      return `<div class="section-title">Aqara presets</div><div class="hint">No Aqara presets yet. Click “+ Create Aqara”. (Needs the Aqara Advanced Lighting integration.)</div>`;
    }
    const tiles = this._aqara.map((a) => `
      <div class="tile aqara">
        <div class="tile-row">
          <button class="mini secondary" data-editaqara="${a.slug}">edit</button>
          <button class="mini danger" data-delaqara="${a.slug}">del</button>
        </div>
        <span class="tile-name">${a.name || "(unnamed)"}<br><span class="hint">${(a.data && a.data.preset) || a.service}</span></span>
      </div>`).join("");
    return `<div class="section-title">Aqara presets</div><div class="grid">${tiles}</div>`;
  }

  _renderAqaraEditor(root) {
    const a = this._editingAqara;
    const services = [
      { v: "start_dynamic_scene", l: "Dynamic Scene" },
      { v: "set_dynamic_effect", l: "Dynamic Effect" },
    ];
    root.innerHTML = `
      <div class="topbar"><h1>${a.slug ? "Edit Aqara preset" : "Create Aqara preset"}</h1>
        <div class="actions"><button class="secondary" id="back">← Back</button></div></div>
      <div class="card">
        <div class="hint" style="margin-bottom:8px">Thin reference to an Aqara Advanced Lighting action. The effect/scene itself lives in the Aqara app — here you just name it and reference its preset.</div>
        <div class="row"><label>Name</label><input type="text" id="aq-name" style="flex:1;min-width:200px"></div>
        <div class="row"><label>Service</label>
          <select id="aq-svc" style="min-width:220px">
            ${services.map((s) => `<option value="${s.v}" ${a.service === s.v ? "selected" : ""}>${s.l}</option>`).join("")}
          </select></div>
        <div class="row"><label>Preset name</label><input type="text" id="aq-preset" placeholder="e.g. Overwatch (from the Aqara app)" style="flex:1;min-width:220px"></div>
        <div class="row"><label>Brightness %</label><input type="number" id="aq-bri" min="1" max="100" placeholder="optional" style="width:120px"></div>
        <div class="row" style="margin-top:8px"><button id="aq-save">${a.slug ? "Update" : "Create"} Aqara preset</button></div>
      </div>`;
    root.querySelector("#back").addEventListener("click", () => { this._view = "browse"; this._render(); });
    root.querySelector("#aq-name").value = a.name;
    root.querySelector("#aq-preset").value = a.preset;
    root.querySelector("#aq-bri").value = a.brightness;
    root.querySelector("#aq-name").addEventListener("input", (e) => (a.name = e.target.value));
    root.querySelector("#aq-svc").addEventListener("change", (e) => (a.service = e.target.value));
    root.querySelector("#aq-preset").addEventListener("input", (e) => (a.preset = e.target.value));
    root.querySelector("#aq-bri").addEventListener("input", (e) => (a.brightness = e.target.value));
    root.querySelector("#aq-save").addEventListener("click", () => this._saveAqara());
  }

  _tileBg(scene) {
    if (scene.img) return `background-image:url('/assets/${DOMAIN}/${scene.img}')`;
    const cols = (scene.lights || []).map((l) => l.hex).filter(Boolean);
    if (!cols.length) return "background:var(--secondary-background-color,#444)";
    if (cols.length === 1) return `background:linear-gradient(135deg, ${cols[0]}, #00000066)`;
    return `background:linear-gradient(135deg, ${cols.join(", ")})`;
  }

  _renderSceneSections() {
    if (!this._presets.length) return `<div class="hint pad">No custom scenes yet. Click “+ Create Custom”.</div>`;
    const cats = {};
    this._presets.forEach((p) => { const c = p.category || "Uncategorised"; (cats[c] = cats[c] || []).push(p); });
    return Object.keys(cats).sort().map((cat) => {
      const items = cats[cat].slice().sort((a, b) => (this._favs.has(b.slug) - this._favs.has(a.slug)));
      return `
        <div class="section-title">${cat}</div>
        <div class="grid">
          ${items.map((p) => `
            <div class="tile" style="${this._tileBg(p)}" data-apply="${p.slug}" title="Apply to selected targets">
              <span class="star ${this._favs.has(p.slug) ? "on" : ""}" data-fav="${p.slug}">★</span>
              <div class="tile-row">
                <button class="mini" data-edit="${p.slug}">edit</button>
                <button class="mini" data-exp="${p.slug}">export</button>
                <button class="mini danger" data-del="${p.slug}">del</button>
              </div>
              <span class="tile-name">${p.name || "(unnamed)"}</span>
            </div>`).join("")}
        </div>`;
    }).join("");
  }

  _renderLookSection() {
    let inner;
    if (!this._looks.length) {
      inner = `<div class="hint">No looks yet. Click “+ Create Look”.</div>`;
    } else {
      inner = `<div class="grid">${this._looks.map((l) => {
        const n = (l.bindings || []).length;
        return `<div class="tile look" data-applylook="${l.slug}" title="Apply look">
            <div class="tile-row">
              <button class="mini" data-editlook="${l.slug}">edit</button>
              <button class="mini danger" data-dellook="${l.slug}">del</button>
            </div>
            <span class="tile-name">${l.name || "(unnamed)"}<br><span class="hint">${n} binding${n === 1 ? "" : "s"}</span></span>
          </div>`;
      }).join("")}</div>`;
    }
    return `<div class="section-title">Looks</div>${inner}`;
  }

  _renderSceneEditor(root) {
    const s = this._editing;
    const lights = this._lights();
    root.innerHTML = `
      <div class="topbar"><h1>${s.slug ? "Edit scene" : "Create scene"}</h1>
        <div class="actions"><button class="secondary" id="back">← Back</button></div></div>
      <div class="card">
        <div class="row"><label>Name</label><input type="text" id="f-name" style="flex:1;min-width:200px"></div>
        <div class="row"><label>Category</label><input type="text" id="f-cat" list="cats" placeholder="e.g. Gaming" style="min-width:200px">
          <datalist id="cats">${[...new Set(this._presets.map((p) => p.category).filter(Boolean))].map((c) => `<option value="${c}">`).join("")}</datalist></div>
        <div class="row"><label>Image</label><input type="file" id="f-img" accept="image/*">
          <span id="imgprev">${s.img ? `<img class="imgprev" src="/assets/${DOMAIN}/${s.img}">` : ""}</span></div>
        <div class="row" style="align-items:flex-start"><label>Colours</label>
          <div style="flex:1"><div id="colors"></div>
            <button class="secondary mini" id="add-color" style="margin-top:6px">+ Add colour</button>
            <span class="hint"> up to ${MAX_COLORS}; ▶ previews one colour on the targets</span></div></div>
        <div class="row"><label>Interval (s)</label><input type="number" id="f-int" min="0" max="3600" style="width:90px">
          <label style="min-width:auto;margin-left:12px">Transition (s)</label><input type="number" id="f-trn" min="0" max="300" style="width:90px">
          <label style="min-width:auto;margin-left:12px">Shuffle</label><input type="checkbox" id="f-shuf"></div>
        <div class="row" style="margin-top:8px">
          <button id="b-save">${s.slug ? "Update" : "Create"} scene</button>
          <label style="min-width:auto"><input type="checkbox" id="b-ql"> + Quick-look (all/targets → this scene)</label>
        </div>
      </div>`;
    root.querySelector("#back").addEventListener("click", () => { this._view = "browse"; this._render(); });
    const q = (id) => root.querySelector(id);
    q("#f-name").value = s.name; q("#f-cat").value = s.category; q("#f-int").value = s.interval; q("#f-trn").value = s.transition; q("#f-shuf").checked = !!s.shuffle;
    q("#f-name").addEventListener("input", (e) => (s.name = e.target.value));
    q("#f-cat").addEventListener("input", (e) => (s.category = e.target.value));
    q("#f-int").addEventListener("input", (e) => (s.interval = e.target.value));
    q("#f-trn").addEventListener("input", (e) => (s.transition = e.target.value));
    q("#f-shuf").addEventListener("change", (e) => (s.shuffle = e.target.checked));
    q("#f-img").addEventListener("change", (e) => { if (e.target.files && e.target.files[0]) this._uploadImage(e.target.files[0]); });
    q("#add-color").addEventListener("click", () => { if (s.colors.length < MAX_COLORS) { s.colors.push("#ffffff"); this._renderColors(); } });
    q("#b-save").addEventListener("click", () => { this._pendingQuickLook = q("#b-ql").checked; this._saveScene(); });
    this._renderColors();
  }

  _renderColors() {
    const wrap = this.shadowRoot.getElementById("colors");
    if (!wrap) return;
    const s = this._editing;
    wrap.innerHTML = "";
    s.colors.forEach((hex, idx) => {
      const row = document.createElement("div");
      row.className = "color-row";
      row.innerHTML = `<input type="color" value="${hex}"><code>${hex}</code>
        <button class="mini" title="Preview this colour">▶</button>
        <button class="mini danger" title="Remove">✕</button>`;
      const [picker] = row.querySelectorAll("input");
      const code = row.querySelector("code");
      const [prev, del] = row.querySelectorAll("button");
      picker.addEventListener("input", (e) => { s.colors[idx] = e.target.value; code.textContent = e.target.value; });
      prev.addEventListener("click", () => this._previewColors([s.colors[idx]]));
      del.addEventListener("click", () => { s.colors.splice(idx, 1); if (!s.colors.length) s.colors = ["#ffffff"]; this._renderColors(); });
      wrap.appendChild(row);
    });
  }

  _renderLookEditor(root) {
    const l = this._editingLook;
    root.innerHTML = `
      <div class="topbar"><h1>${l.slug ? "Edit look" : "Create look"}</h1>
        <div class="actions"><button class="secondary" id="back">← Back</button></div></div>
      <div class="card">
        <div class="row"><label>Name</label><input type="text" id="l-name" style="flex:1;min-width:200px"></div>
        <div id="bindings"></div>
        <button class="secondary mini" id="add-b" style="margin:6px 0">+ Add binding</button>
        <div class="hint">A binding is either a scene on some lights, or an effect service (e.g. the Aqara RGB ring).</div>
        <div class="row" style="margin-top:8px"><button id="b-savelook">${l.slug ? "Update" : "Create"} look</button></div>
      </div>`;
    root.querySelector("#back").addEventListener("click", () => { this._view = "browse"; this._render(); });
    root.querySelector("#l-name").value = l.name;
    root.querySelector("#l-name").addEventListener("input", (e) => (l.name = e.target.value));
    root.querySelector("#add-b").addEventListener("click", () => { l.bindings.push(this._blankBinding()); this._renderBindings(); });
    root.querySelector("#b-savelook").addEventListener("click", () => this._saveLook());
    this._renderBindings();
  }

  _renderBindings() {
    const wrap = this.shadowRoot.getElementById("bindings");
    if (!wrap) return;
    const l = this._editingLook;
    const { groups, lights: tlights } = this._targetEntities();
    const checkboxes = (b) => `<div class="targets-box" style="flex:1;min-width:240px">
        ${groups.length ? `<div class="tgt-head">Groups</div>` : ""}
        ${groups.map((g) => `<label class="tgt"><input type="checkbox" class="b-tgt" value="${g.id}" ${b.entity_ids.includes(g.id) ? "checked" : ""}> ${g.label} <span class="hint">(group)</span></label>`).join("")}
        ${groups.length ? `<div class="tgt-head">Lights</div>` : ""}
        ${tlights.map((l2) => `<label class="tgt"><input type="checkbox" class="b-tgt" value="${l2.id}" ${b.entity_ids.includes(l2.id) ? "checked" : ""}> ${l2.label}</label>`).join("")}
      </div>`;
    wrap.innerHTML = "";
    l.bindings.forEach((b, idx) => {
      const card = document.createElement("div");
      card.className = "subcard";
      const kind = b.kind || "scene";
      const lightsSelect = checkboxes(b);
      const sceneRows = `
        <div class="row"><label>Scene</label>
          <select class="b-scene" style="min-width:220px"><option value="">– pick a scene –</option>
            ${this._presets.map((p) => `<option value="${p.slug}" ${b.scene === p.slug ? "selected" : ""}>${p.name || "(unnamed)"}</option>`).join("")}</select></div>
        <div class="row"><label>Interval (s)</label><input type="number" class="b-int" min="0" max="3600" placeholder="scene default" style="width:130px" value="${b.interval}">
          <label style="min-width:auto;margin-left:12px">Transition (s)</label><input type="number" class="b-trn" min="0" max="300" placeholder="scene default" style="width:130px" value="${b.transition}"></div>`;
      const aqaraRows = `
        <div class="row"><label>Aqara preset</label>
          <select class="b-aqara" style="min-width:240px"><option value="">– pick an Aqara preset –</option>
            ${this._aqara.map((a) => `<option value="${a.slug}" ${b.aqara === a.slug ? "selected" : ""}>${a.name || "(unnamed)"}</option>`).join("")}</select></div>`;
      const effectRows = `
        <div class="row"><label>Service</label><input type="text" class="b-svc" style="flex:1;min-width:260px" value="${b.service || ""}"></div>
        <div class="row"><label>Effect</label><input type="text" class="b-eff" placeholder="effect name" style="min-width:200px" value="${b.effect || ""}"></div>`;
      const rows = kind === "aqara" ? aqaraRows : kind === "effect" ? effectRows : sceneRows;
      card.innerHTML = `
        <div class="row"><label>Type</label>
          <select class="b-kind">
            <option value="scene" ${kind === "scene" ? "selected" : ""}>Scene</option>
            <option value="aqara" ${kind === "aqara" ? "selected" : ""}>Aqara preset</option>
            <option value="effect" ${kind === "effect" ? "selected" : ""}>Effect (raw service)</option>
          </select>
          <button class="mini danger b-rm" style="margin-left:auto">remove</button></div>
        <div class="row" style="align-items:flex-start"><label>${kind === "scene" ? "Lights" : "Targets"}</label>${lightsSelect}</div>
        ${rows}`;
      card.querySelector(".b-kind").addEventListener("change", (e) => { b.kind = e.target.value; this._renderBindings(); });
      card.querySelectorAll(".b-tgt").forEach((cb) => cb.addEventListener("change", (e) => {
        const id = e.target.value;
        if (e.target.checked) { if (!b.entity_ids.includes(id)) b.entity_ids.push(id); }
        else { b.entity_ids = b.entity_ids.filter((x) => x !== id); }
      }));
      card.querySelector(".b-rm").addEventListener("click", () => { l.bindings.splice(idx, 1); if (!l.bindings.length) l.bindings = [this._blankBinding()]; this._renderBindings(); });
      if (kind === "aqara") {
        card.querySelector(".b-aqara").addEventListener("change", (e) => (b.aqara = e.target.value));
      } else if (kind === "effect") {
        card.querySelector(".b-svc").addEventListener("input", (e) => (b.service = e.target.value));
        card.querySelector(".b-eff").addEventListener("input", (e) => (b.effect = e.target.value));
      } else {
        card.querySelector(".b-scene").addEventListener("change", (e) => (b.scene = e.target.value));
        card.querySelector(".b-int").addEventListener("input", (e) => (b.interval = e.target.value));
        card.querySelector(".b-trn").addEventListener("input", (e) => (b.transition = e.target.value));
      }
      wrap.appendChild(card);
    });
  }

  _renderIO(root) {
    root.innerHTML = `
      <div class="topbar"><h1>Import / Export</h1>
        <div class="actions"><button class="secondary" id="back">← Back</button></div></div>
      <div class="card">
        <div class="hint">Export a scene to a shareable string (colours + name + timing; no image). Paste a string and import it into the editor.</div>
        <textarea id="io" rows="4" style="width:100%;margin-top:8px" placeholder="BSP1:...">${this._ioString || ""}</textarea>
        <div class="row" style="margin-top:8px"><button id="io-import">Import into editor</button>
          <span class="hint">Tip: pick a scene in the browse view and hit “export” to fill this box.</span></div>
      </div>`;
    root.querySelector("#back").addEventListener("click", () => { this._view = "browse"; this._render(); });
    root.querySelector("#io-import").addEventListener("click", () => this._importString(root.querySelector("#io").value));
    if (this._ioString) { const ta = root.querySelector("#io"); ta.focus(); ta.select(); }
  }

  _toast(message) {
    const t = this.shadowRoot.getElementById("toast");
    if (!t) return;
    t.textContent = message; t.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  _css() {
    return `
      :host { display:block; padding:16px 24px 64px; color:var(--primary-text-color); }
      h1 { font-size:22px; font-weight:500; margin:0; }
      .topbar { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:12px; }
      .actions { display:flex; gap:8px; flex-wrap:wrap; }
      .card { background:var(--card-background-color,#1c1c1c); border-radius:14px; padding:16px; margin-bottom:16px; box-shadow:var(--ha-card-box-shadow,0 2px 6px rgba(0,0,0,.25)); }
      .subcard { background:var(--secondary-background-color,#262626); border-radius:10px; padding:12px; margin-bottom:10px; }
      .card-title { font-weight:600; margin-bottom:8px; }
      .section-title { font-weight:600; font-size:15px; margin:18px 2px 10px; }
      .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:14px; }
      .tile { position:relative; height:96px; border-radius:12px; padding:10px; cursor:pointer; overflow:hidden;
        background-size:cover; background-position:center; display:flex; flex-direction:column; justify-content:flex-end;
        box-shadow:inset 0 -40px 40px -20px rgba(0,0,0,.55); transition:transform .08s; }
      .tile:hover { transform:translateY(-2px); }
      .tile.look { background:linear-gradient(135deg,#3a3a55,#23233a); }
      .tile.aqara { background:linear-gradient(135deg,#1f4d45,#13302c); }
      .tile-name { color:#fff; font-weight:600; text-shadow:0 1px 3px rgba(0,0,0,.7); }
      .tile-row { position:absolute; top:8px; left:8px; display:flex; gap:4px; opacity:0; transition:opacity .1s; }
      .tile:hover .tile-row { opacity:1; }
      .star { position:absolute; top:6px; right:8px; font-size:20px; color:rgba(255,255,255,.5); cursor:pointer; text-shadow:0 1px 3px rgba(0,0,0,.7); }
      .star.on { color:#ffd54a; }
      .lights { padding:6px; border-radius:8px; border:1px solid var(--divider-color,#444); background:var(--card-background-color,#1c1c1c); color:var(--primary-text-color); width:100%; box-sizing:border-box; }
      .targets-box { max-height:220px; overflow:auto; border:1px solid var(--divider-color,#444); border-radius:8px; padding:8px; }
      .tgt { display:flex; align-items:center; gap:8px; padding:3px 4px; font-size:14px; cursor:pointer; color:var(--primary-text-color); }
      .tgt:hover { background:var(--secondary-background-color,#262626); border-radius:6px; }
      .tgt input { min-width:auto; }
      .tgt-head { font-size:12px; font-weight:600; color:var(--secondary-text-color); margin:8px 2px 2px; }
      .tun { display:flex; gap:14px; align-items:center; flex-wrap:wrap; }
      .tun label { display:flex; gap:6px; align-items:center; }
      .row { display:flex; gap:8px; align-items:center; margin-bottom:10px; flex-wrap:wrap; }
      label { font-size:13px; color:var(--secondary-text-color); min-width:90px; }
      input[type=text], input[type=number], select, textarea { padding:7px 9px; border-radius:7px; border:1px solid var(--divider-color,#444); background:var(--card-background-color,#1c1c1c); color:var(--primary-text-color); font:inherit; }
      input[type=color] { width:42px; height:32px; border:none; background:none; padding:0; cursor:pointer; }
      button { padding:7px 14px; border-radius:8px; border:none; cursor:pointer; font:inherit; background:var(--primary-color,#03a9f4); color:var(--text-primary-color,#fff); }
      button.secondary { background:var(--secondary-background-color,#333); color:var(--primary-text-color); }
      button.danger { background:var(--error-color,#db4437); color:#fff; }
      button.mini { padding:3px 8px; font-size:12px; }
      .color-row { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
      .color-row code { font-family:monospace; }
      .imgprev { width:120px; height:70px; object-fit:cover; border-radius:8px; border:1px solid var(--divider-color,#444); }
      .hint { font-size:12px; color:var(--secondary-text-color); }
      .pad { padding:8px 2px; }
      .mono { font-family:monospace; }
      #toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:#323232; color:#fff; padding:10px 18px; border-radius:8px; opacity:0; transition:opacity .2s; pointer-events:none; z-index:10; }
      #toast.show { opacity:1; }
    `;
  }
}

customElements.define("benni-scene-presets-panel", BenniScenePresetsPanel);
