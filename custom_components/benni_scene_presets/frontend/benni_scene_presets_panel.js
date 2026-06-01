// Benni Scene Presets - custom panel (framework-free web component), v3.
//
// Browse-first product UI: a Targets & Options bar (global apply context for
// scenes/aqara presets — Looks carry their own targets), a unified preset grid
// with type tabs, a detail side panel, and editors for scenes / Aqara presets /
// looks. Talks to the integration over the benni_scene_presets/* WS commands
// and (for applying Aqara presets directly) aqara_advanced_lighting services.

const DOMAIN = "benni_scene_presets";
const AQARA_DOMAIN = "aqara_advanced_lighting";
const MAX_COLORS = 10;
const FAV_KEY = "bsp_favorites";

// Mirror of const.AQARA_STOP_SERVICES: which AAL stop service undoes each start.
const AQARA_STOP_SERVICES = {
  start_dynamic_scene: "stop_dynamic_scene",
  set_dynamic_effect: "stop_effect",
  set_segment_pattern: "stop_effect",
  create_gradient: "stop_effect",
  create_blocks: "stop_effect",
  start_cct_sequence: "stop_cct_sequence",
  start_segment_sequence: "stop_segment_sequence",
};

const slugify = (name) =>
  ((name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")) || "scene";
const esc = (s) => (s == null ? "" : String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])));

class BenniScenePresetsPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._init = false;
    this._presets = [];
    this._looks = [];
    this._aqara = [];
    this._dynamic = [];
    this._tab = "All";
    this._search = "";
    this._sort = "name";
    this._selected = null; // {type, slug}
    this._view = "browse"; // browse | scene | aqara | look | io | targets
    this._targets = [];
    this._tunables = { dynamic: false, shuffle: false, customBri: false, brightness: 128, customTrans: false, transition: 2 };
    this._editing = this._blankScene();
    this._editingLook = this._blankLook();
    this._editingAqara = this._blankAqara();
    this._favs = this._loadFavs();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._init) { this._init = true; this._renderShell(); this._refresh(); return; }
    // Keep the Playing badges live: re-render the browse grid when a look
    // switch flips on/off. Skip while editing or typing in search to avoid jank.
    if (this._view === "browse") {
      const sig = this._looks.map((l) => (this._isRunning({ type: "look", slug: l.slug }) ? "1" : "0")).join("");
      if (sig !== this._runSig) {
        this._runSig = sig;
        const active = this.shadowRoot.activeElement;
        if (!active || active.id !== "search") this._render();
      }
    }
  }
  get hass() { return this._hass; }

  _blankScene() { return { slug: null, name: "", category: "", img: null, colors: ["#ff8800"], interval: 300, transition: 60, shuffle: true }; }
  _blankBinding() { return { kind: "scene", entity_ids: [], scene: "", interval: "", transition: "", aqara: "", service: "aqara_advanced_lighting.set_dynamic_effect", effect: "" }; }
  _blankLook() { return { slug: null, name: "", img: null, bindings: [this._blankBinding()] }; }
  _blankAqara() { return { slug: null, name: "", img: null, service: "start_dynamic_scene", preset: "", brightness: "" }; }

  _loadFavs() { try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]")); } catch { return new Set(); } }
  _saveFavs() { localStorage.setItem(FAV_KEY, JSON.stringify([...this._favs])); }

  // ---- data ----------------------------------------------------------------

  async _refresh() {
    try { const d = await this._hass.callWS({ type: `${DOMAIN}/list_presets` }); this._presets = (d.presets || []).filter((p) => p.custom); }
    catch (e) { this._presets = []; this._toast(`Could not load scenes: ${e.message || e}`); }
    try { const d = await this._hass.callWS({ type: `${DOMAIN}/list_looks` }); this._looks = d.looks || []; } catch { this._looks = []; }
    try { const d = await this._hass.callWS({ type: `${DOMAIN}/list_aqara` }); this._aqara = d.aqara || []; } catch { this._aqara = []; }
    try { const d = await this._hass.callWS({ type: `${DOMAIN}/get_dynamic_scenes` }); this._dynamic = d.dynamic_scenes || []; } catch { this._dynamic = []; }
    this._render();
  }

  // Unified item list: scenes (custom), aqara presets, looks.
  _items() {
    const out = [];
    this._presets.forEach((p) => out.push({ type: "custom", slug: p.slug, name: p.name, category: p.category || "", obj: p }));
    this._aqara.forEach((a) => out.push({ type: "aqara", slug: a.slug, name: a.name, category: "Aqara", obj: a }));
    this._looks.forEach((l) => out.push({ type: "look", slug: l.slug, name: l.name, category: "Looks", obj: l }));
    return out;
  }
  _categories() {
    return [...new Set(this._presets.map((p) => p.category).filter(Boolean))].sort();
  }
  _typeLabel(t) { return t === "aqara" ? "Aqara preset" : t === "look" ? "Look" : "Custom preset"; }

  _isReady(it) {
    if (it.type === "custom") return (it.obj.lights || []).length > 0;
    if (it.type === "aqara") return !!(it.obj.service && it.obj.data && it.obj.data.preset);
    if (it.type === "look") return (it.obj.bindings || []).length > 0;
    return true;
  }
  _warnings() {
    return this._items().filter((it) => !this._isReady(it)).length;
  }

  // ---- targets -------------------------------------------------------------

  _isAqaraLight(id) {
    const ent = this._hass.entities && this._hass.entities[id];
    return !!(ent && ent.platform === AQARA_DOMAIN);
  }
  // For SP-scene targeting we exclude AAL RGBIC lights (those want Aqara effects,
  // not a static colour). includeAqara=true for the generic picker.
  _targetEntities(includeAqara) {
    const states = this._hass.states || {};
    const groups = Object.keys(states)
      .filter((id) => id.startsWith("group.") || id.startsWith("sensor.benni_light_group_"))
      .sort().map((id) => ({ id, label: (states[id].attributes && states[id].attributes.friendly_name) || id }));
    const lights = Object.keys(states).filter((id) => id.startsWith("light.") && (includeAqara || !this._isAqaraLight(id))).sort()
      .map((id) => ({ id, label: id }));
    return { groups, lights };
  }
  _expandList(ids) {
    const states = this._hass.states || {};
    const out = [];
    for (const id of ids) {
      if (id.startsWith("sensor.benni_light_group_")) {
        const m = states[id] && states[id].attributes && states[id].attributes.entity_id;
        if (m) out.push(...[].concat(m));
      } else out.push(id);
    }
    return [...new Set(out)];
  }
  _resolveTargets() { return this._expandList(this._targets); }
  _targetsLabel() {
    if (!this._targets.length) return "No targets";
    const groups = this._targets.filter((t) => !t.startsWith("light."));
    if (groups.length === 1 && this._targets.length === 1) {
      const st = this._hass.states[groups[0]];
      return (st && st.attributes && st.attributes.friendly_name) || groups[0];
    }
    const n = this._resolveTargets().length;
    return `${n} light${n === 1 ? "" : "s"}`;
  }

  // ---- running state -------------------------------------------------------

  // True if the given item is currently playing.
  // - look: the switch.benni_look_<slug> entity reflects live activity.
  // - custom scene: a dynamic scene whose preset slug matches is running.
  // - aqara: not tracked server-side; treat as stateless (no running flag).
  _isRunning(it) {
    if (!it) return false;
    if (it.type === "look") {
      const st = this._hass.states && this._hass.states[`switch.benni_look_${it.slug}`];
      return !!(st && st.state === "on");
    }
    if (it.type === "custom") {
      return (this._dynamic || []).some((d) => d.parameters && d.parameters.preset === it.slug);
    }
    return false;
  }
  _anyRunning() {
    return (this._dynamic || []).length > 0
      || this._looks.some((l) => this._isRunning({ type: "look", slug: l.slug }));
  }

  // ---- apply / stop --------------------------------------------------------

  async _apply(it) {
    try {
      if (it.type === "look") {
        const data = { look: it.slug };
        if (this._tunables.customBri) data.brightness = Number(this._tunables.brightness);
        await this._hass.callService(DOMAIN, "apply_look", data);
        this._toast(`Look "${it.name}" applied.`);
        return;
      }
      const entity_id = this._resolveTargets();
      if (!entity_id.length) { this._toast("Pick targets first (Edit Targets)."); return; }
      const t = this._tunables;
      if (it.type === "aqara") {
        const a = it.obj;
        const data = { ...(a.data || {}), entity_id };
        if (a.service === "set_dynamic_effect" && data.turn_on === undefined) data.turn_on = true;
        await this._hass.callService(AQARA_DOMAIN, a.service, data);
      } else {
        const data = { targets: { entity_id }, preset: it.slug };
        if (t.customBri) data.brightness = Number(t.brightness);
        if (t.customTrans) data.transition = Number(t.transition);
        if (t.dynamic) { data.interval = it.obj.interval != null ? it.obj.interval : 300; await this._hass.callService(DOMAIN, "start_dynamic_scene", data); }
        else { data.shuffle = !!t.shuffle; await this._hass.callService(DOMAIN, "apply_preset", data); }
      }
      this._toast(`Applied "${it.name}".`);
    } catch (e) { this._toast(`Apply failed: ${e.message || e}`); }
    this._refresh();
  }

  async _stop(it) {
    try {
      if (it.type === "look") {
        await this._hass.callService(DOMAIN, "stop_look", { look: it.slug });
      } else if (it.type === "aqara") {
        const entity_id = this._resolveTargets();
        if (!entity_id.length) { this._toast("Pick targets first (Edit Targets)."); return; }
        const stopSvc = AQARA_STOP_SERVICES[it.obj.service] || "stop_effect";
        await this._hass.callService(AQARA_DOMAIN, stopSvc, { entity_id });
      } else {
        // Custom scene: stop the dynamic loop on the current targets.
        const entity_id = this._resolveTargets();
        if (entity_id.length) await this._hass.callService(DOMAIN, "stop_dynamic_scenes_for_targets", { targets: { entity_id } });
        else await this._hass.callService(DOMAIN, "stop_all_dynamic_scenes", {});
      }
      this._toast(`Stopped "${it.name}".`);
    } catch (e) { this._toast(`Stop failed: ${e.message || e}`); }
    this._refresh();
  }

  async _stopAll() {
    try { await this._hass.callService(DOMAIN, "stop_all_dynamic_scenes", {}); this._toast("All scenes stopped."); }
    catch (e) { this._toast(`Stop failed: ${e.message || e}`); }
    this._refresh();
  }

  _edit(it) {
    if (it.type === "custom") this._editScene(it.obj);
    else if (it.type === "aqara") this._editAqara(it.obj);
    else if (it.type === "look") this._editLook(it.obj);
  }
  async _delete(it) {
    if (!confirm(`Delete "${it.name}"?`)) return;
    const cmd = it.type === "aqara" ? "delete_aqara" : it.type === "look" ? "delete_look" : "delete_preset";
    try { await this._hass.callWS({ type: `${DOMAIN}/${cmd}`, slug: it.slug }); this._toast("Deleted."); if (this._selected && this._selected.slug === it.slug) this._selected = null; this._refresh(); }
    catch (e) { this._toast(`Delete failed: ${e.message || e}`); }
  }
  _toggleFav(key, ev) { ev.stopPropagation(); if (this._favs.has(key)) this._favs.delete(key); else this._favs.add(key); this._saveFavs(); this._render(); }

  // ---- scene CRUD ----------------------------------------------------------

  async _saveScene() {
    const s = this._editing;
    if (!s.name.trim()) { this._toast("Please enter a name."); return; }
    if (!s.colors.length) { this._toast("Add at least one colour."); return; }
    const msg = { type: `${DOMAIN}/save_preset`, name: s.name.trim(), category: s.category || null, colors: s.colors, interval: Number(s.interval), transition: Number(s.transition), shuffle: !!s.shuffle };
    if (s.slug) msg.slug = s.slug;
    if (s.img) msg.img = s.img;
    try { await this._hass.callWS(msg); this._toast("Saved."); this._editing = this._blankScene(); this._view = "browse"; await this._refresh(); }
    catch (e) { this._toast(`Save failed: ${e.message || e}`); }
  }
  async _deleteSceneSlug(slug) { try { await this._hass.callWS({ type: `${DOMAIN}/delete_preset`, slug }); this._toast("Deleted."); this._refresh(); } catch (e) { this._toast(`Delete failed: ${e.message || e}`); } }
  _editScene(p) {
    this._editing = { slug: p.slug, name: p.name || "", category: p.category || "", img: p.img || null,
      colors: (p.lights || []).map((l) => l.hex || "#ffffff"), interval: p.interval != null ? p.interval : 300, transition: p.transition != null ? p.transition : 60, shuffle: p.shuffle != null ? p.shuffle : true };
    if (!this._editing.colors.length) this._editing.colors = ["#ff8800"];
    this._view = "scene"; this._render();
  }
  async _previewColors(colors) {
    const entity_id = this._resolveTargets();
    if (!entity_id.length) { this._toast("Pick targets to preview on."); return; }
    try { await this._hass.callWS({ type: `${DOMAIN}/apply_preview`, targets: { entity_id }, colors, transition: 1 }); } catch (e) { this._toast(`Preview failed: ${e.message || e}`); }
  }
  async _uploadImage(file, obj) {
    const form = new FormData(); form.append("file", file);
    try {
      const resp = await fetch(`/api/${DOMAIN}/upload_image`, { method: "POST", body: form, headers: { Authorization: `Bearer ${this._hass.auth.data.access_token}` } });
      if (!resp.ok) throw new Error(await resp.text());
      const json = await resp.json(); (obj || this._editing).img = json.img; this._render(); this._toast("Image uploaded.");
    } catch (e) { this._toast(`Upload failed: ${e.message || e}`); }
  }

  _imgRow(obj) {
    return `<div class="row"><label>Image</label><input type="file" class="f-img" accept="image/*">${obj.img ? `<img class="imgprev" src="/assets/${DOMAIN}/${obj.img}">` : ""}</div>`;
  }

  // ---- aqara CRUD ----------------------------------------------------------

  _aqaraPresetOptions(service) {
    try { const o = this._hass.services.aqara_advanced_lighting[service].fields.preset.selector.select.options; return (o || []).map((x) => (typeof x === "string" ? { value: x, label: x } : x)); }
    catch { return []; }
  }
  async _saveAqara() {
    const a = this._editingAqara;
    if (!a.name.trim()) { this._toast("Name the Aqara preset."); return; }
    if (!a.preset.trim()) { this._toast("Pick the Aqara preset."); return; }
    const data = { preset: a.preset.trim() };
    if (a.brightness !== "" && a.brightness != null) data.brightness = Number(a.brightness);
    const msg = { type: `${DOMAIN}/save_aqara`, name: a.name.trim(), service: a.service, data };
    if (a.slug) msg.slug = a.slug;
    if (a.img) msg.img = a.img;
    try { await this._hass.callWS(msg); this._toast("Aqara preset saved."); this._editingAqara = this._blankAqara(); this._view = "browse"; await this._refresh(); }
    catch (e) { this._toast(`Save failed: ${e.message || e}`); }
  }
  _editAqara(a) {
    const d = a.data || {};
    this._editingAqara = { slug: a.slug, name: a.name || "", img: a.img || null, service: a.service || "start_dynamic_scene", preset: d.preset || "", brightness: d.brightness != null ? d.brightness : "" };
    this._view = "aqara"; this._render();
  }

  // ---- look CRUD -----------------------------------------------------------

  async _saveLook() {
    const l = this._editingLook;
    if (!l.name.trim()) { this._toast("Name the look."); return; }
    const bindings = l.bindings.map((b) => {
      const entity_id = this._expandList(b.entity_ids);
      if (b.kind === "aqara") { if (!entity_id.length || !b.aqara) return null; return { kind: "aqara", targets: { entity_id }, aqara: b.aqara }; }
      if (b.kind === "effect") { if (!entity_id.length || !b.service || !b.effect) return null; return { kind: "effect", targets: { entity_id }, service: b.service, data: { effect: b.effect } }; }
      if (!entity_id.length || !b.scene) return null;
      return { kind: "scene", targets: { entity_id }, scene: b.scene, interval: b.interval === "" ? null : Number(b.interval), transition: b.transition === "" ? null : Number(b.transition) };
    }).filter(Boolean);
    if (!bindings.length) { this._toast("Add at least one complete binding."); return; }
    const msg = { type: `${DOMAIN}/save_look`, name: l.name.trim(), bindings };
    if (l.slug) msg.slug = l.slug;
    if (l.img) msg.img = l.img;
    try { await this._hass.callWS(msg); this._toast("Look saved."); this._editingLook = this._blankLook(); this._view = "browse"; await this._refresh(); }
    catch (e) { this._toast(`Save failed: ${e.message || e}`); }
  }
  _editLook(look) {
    this._editingLook = { slug: look.slug, name: look.name || "", img: look.img || null,
      bindings: (look.bindings || []).map((b) => ({ kind: b.kind || "scene", entity_ids: b.targets && b.targets.entity_id ? [].concat(b.targets.entity_id) : [], scene: b.scene || "", interval: b.interval != null ? b.interval : "", transition: b.transition != null ? b.transition : "", aqara: b.aqara || "", service: b.service || "aqara_advanced_lighting.set_dynamic_effect", effect: (b.data && b.data.effect) || "" })) };
    if (!this._editingLook.bindings.length) this._editingLook.bindings = [this._blankBinding()];
    this._view = "look"; this._render();
  }

  // ---- import / export -----------------------------------------------------

  _exportScene(p) {
    const payload = { n: p.name, cat: p.category || "", c: (p.lights || []).map((l) => l.hex || "#ffffff"), i: p.interval, t: p.transition, s: p.shuffle };
    this._ioString = "BSP1:" + btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    this._view = "io"; this._render(); this._toast("Export string ready below.");
  }
  _importString(str) {
    try {
      str = (str || "").trim();
      if (!str.startsWith("BSP1:")) throw new Error("Not a BSP1 string");
      const p = JSON.parse(decodeURIComponent(escape(atob(str.slice(5)))));
      this._editing = { slug: null, name: p.n || "", category: p.cat || "", img: null, colors: (p.c && p.c.length ? p.c : ["#ff8800"]).slice(0, MAX_COLORS), interval: p.i != null ? p.i : 300, transition: p.t != null ? p.t : 60, shuffle: p.s != null ? p.s : true };
      this._view = "scene"; this._render(); this._toast("Imported — review and create.");
    } catch (e) { this._toast(`Import failed: ${e.message || e}`); }
  }

  // ---- rendering -----------------------------------------------------------

  _renderShell() { this.shadowRoot.innerHTML = `<style>${this._css()}</style><div id="root"></div><div id="toast"></div>`; this._render(); }

  _render() {
    const root = this.shadowRoot.getElementById("root");
    if (!root) return;
    if (this._view === "scene") return this._renderSceneEditor(root);
    if (this._view === "aqara") return this._renderAqaraEditor(root);
    if (this._view === "look") return this._renderLookEditor(root);
    if (this._view === "targets") return this._renderTargetsEditor(root);
    if (this._view === "io") return this._renderIO(root);
    this._renderBrowse(root);
  }

  _gradient(it) {
    if (it.obj && it.obj.img) return `background-image:url('/assets/${DOMAIN}/${it.obj.img}')`;
    if (it.type === "custom") {
      const cols = (it.obj.lights || []).map((l) => l.hex).filter(Boolean);
      if (cols.length > 1) return `background:linear-gradient(135deg,${cols.join(",")})`;
      if (cols.length === 1) return `background:linear-gradient(135deg,${cols[0]},#00000066)`;
    }
    if (it.type === "look") return "background:linear-gradient(135deg,#3a3a55,#23233a)";
    if (it.type === "aqara") return "background:linear-gradient(135deg,#1f4d45,#13302c)";
    return "background:var(--secondary-background-color,#333)";
  }

  _renderBrowse(root) {
    const t = this._tunables;
    const tabs = ["All", ...this._categories().filter((c) => c !== "Aqara" && c !== "Looks"), "Custom", "Aqara", "Looks"];
    let items = this._items();
    if (this._tab === "Custom") items = items.filter((i) => i.type === "custom");
    else if (this._tab === "Aqara") items = items.filter((i) => i.type === "aqara");
    else if (this._tab === "Looks") items = items.filter((i) => i.type === "look");
    else if (this._tab !== "All") items = items.filter((i) => i.type === "custom" && i.category === this._tab);
    if (this._search) { const q = this._search.toLowerCase(); items = items.filter((i) => (i.name || "").toLowerCase().includes(q)); }
    items.sort((a, b) => (this._favs.has(`${b.type}:${b.slug}`) - this._favs.has(`${a.type}:${a.slug}`)) || (a.name || "").localeCompare(b.name || ""));

    root.innerHTML = `
      <div class="topbar">
        <div class="brand"><span class="logo">◆</span><h1>Benni Scene Presets</h1></div>
        <div class="actions">${this._anyRunning() ? `<button class="secondary danger" id="a-stopall">◼ Stop all</button>` : ""}<button id="a-new">+ New Preset</button><button class="secondary" id="a-io">⇅ Import / Export</button></div>
      </div>

      <div class="card targets">
        <div class="t-head"><span class="t-ico">◎</span><div><div class="t-title">Targets &amp; Options</div><div class="hint">Where &amp; how scene/Aqara presets are applied (Looks carry their own targets).</div></div></div>
        <div class="chips">
          <span class="chip">🗂 ${esc(this._targetsLabel())}</span>
          <span class="chip">💡 ${this._resolveTargets().length} lights</span>
          <span class="chip">☀ Brightness: ${t.customBri ? t.brightness : "Auto"}</span>
          <span class="chip">〜 Transition: ${t.customTrans ? t.transition + "s" : "scene"}</span>
          <span class="chip">⏲ Dynamic: ${t.dynamic ? "On" : "Off"}</span>
        </div>
        <button class="secondary edit-t" id="a-targets">⚙ Edit Targets</button>
      </div>

      <div class="card list">
        <div class="toolbar">
          <div class="tabs">${tabs.map((tb) => `<button class="tab ${this._tab === tb ? "on" : ""}" data-tab="${esc(tb)}">${esc(tb)}</button>`).join("")}</div>
          <div class="tools"><input type="text" id="search" placeholder="Search presets…" value="${esc(this._search)}"></div>
        </div>
        <div class="grid">${items.map((it) => this._tile(it)).join("") || `<div class="hint pad">Nothing here yet. Click “+ New Preset”.</div>`}</div>
      </div>

      <div class="footer"><span>📦 ${this._items().length} presets</span><span class="${this._warnings() ? "warn" : ""}">⚠ ${this._warnings()} warning${this._warnings() === 1 ? "" : "s"}</span></div>

      ${this._selected ? this._renderDetail() : ""}
      ${this._newOpen ? `<div class="overlay" id="newmodal"><div class="modal">
        <h3>New preset</h3>
        <div class="row"><label>Type</label><select id="nm-type"><option value="scene">Custom scene</option><option value="aqara">Aqara preset</option><option value="look">Look</option></select></div>
        <div class="row" style="justify-content:flex-end;margin:0"><button class="secondary" id="nm-cancel">Cancel</button><button id="nm-create">Create</button></div>
      </div></div>` : ""}
    `;

    const q = (id) => root.querySelector(id);
    q("#a-new").addEventListener("click", () => this._newPreset());
    { const sa = q("#a-stopall"); if (sa) sa.addEventListener("click", () => this._stopAll()); }
    q("#a-io").addEventListener("click", () => { this._ioString = ""; this._view = "io"; this._render(); });
    q("#a-targets").addEventListener("click", () => { this._view = "targets"; this._render(); });
    q("#search").addEventListener("input", (e) => { this._search = e.target.value; this._render(); q("#search").focus(); });
    root.querySelectorAll("[data-tab]").forEach((el) => el.addEventListener("click", () => { this._tab = el.dataset.tab; this._render(); }));
    root.querySelectorAll("[data-key]").forEach((el) => el.addEventListener("click", () => { const [type, slug] = el.dataset.key.split("::"); this._selected = { type, slug }; this._render(); }));
    root.querySelectorAll("[data-apply]").forEach((el) => el.addEventListener("click", (e) => { e.stopPropagation(); this._apply(this._itemByKey(el.dataset.apply)); }));
    root.querySelectorAll("[data-stopk]").forEach((el) => el.addEventListener("click", (e) => { e.stopPropagation(); this._stop(this._itemByKey(el.dataset.stopk)); }));
    root.querySelectorAll("[data-editk]").forEach((el) => el.addEventListener("click", (e) => { e.stopPropagation(); this._edit(this._itemByKey(el.dataset.editk)); }));
    root.querySelectorAll("[data-delk]").forEach((el) => el.addEventListener("click", (e) => { e.stopPropagation(); this._delete(this._itemByKey(el.dataset.delk)); }));
    root.querySelectorAll("[data-favk]").forEach((el) => el.addEventListener("click", (e) => this._toggleFav(el.dataset.favk, e)));
    const det = root.querySelector("#detail");
    if (det) {
      det.querySelector("#d-close").addEventListener("click", () => { this._selected = null; this._render(); });
      const dap = det.querySelector("#d-apply"); if (dap) dap.addEventListener("click", () => this._apply(this._selectedItem()));
      const dst = det.querySelector("#d-stop"); if (dst) dst.addEventListener("click", () => this._stop(this._selectedItem()));
      const ded = det.querySelector("#d-edit"); if (ded) ded.addEventListener("click", () => this._edit(this._selectedItem()));
      const dex = det.querySelector("#d-export"); if (dex) dex.addEventListener("click", () => this._exportScene(this._selectedItem().obj));
    }
    const nm = root.querySelector("#newmodal");
    if (nm) {
      nm.querySelector("#nm-cancel").addEventListener("click", () => { this._newOpen = false; this._render(); });
      nm.querySelector("#nm-create").addEventListener("click", () => this._createNew(nm.querySelector("#nm-type").value));
      nm.addEventListener("click", (e) => { if (e.target === nm) { this._newOpen = false; this._render(); } });
    }
  }

  _itemByKey(k) { const [type, slug] = k.split("::"); return this._items().find((i) => i.type === type && i.slug === slug); }
  _selectedItem() { return this._selected ? this._items().find((i) => i.type === this._selected.type && i.slug === this._selected.slug) : null; }

  _tile(it) {
    const key = `${it.type}::${it.slug}`;
    const favKey = `${it.type}:${it.slug}`;
    const ready = this._isReady(it);
    const running = this._isRunning(it);
    const canStop = it.type !== "aqara"; // aqara has no running state to reflect
    return `
      <div class="tile ${running ? "playing" : ""} ${this._selected && this._selected.slug === it.slug && this._selected.type === it.type ? "sel" : ""}" data-key="${key}">
        <div class="thumb" style="${this._gradient(it)}"><span class="star ${this._favs.has(favKey) ? "on" : ""}" data-favk="${favKey}">★</span>${running ? `<span class="playing-badge">● Playing</span>` : ""}</div>
        <div class="body">
          <div class="name">${esc(it.name) || "(unnamed)"}</div>
          <div class="meta"><span class="badge ${it.type}">${this._typeLabel(it.type)}</span><span class="status ${ready ? "ok" : "warn"}">${ready ? "● Ready" : "▲ Incomplete"}</span></div>
          <div class="row tile-actions">
            <button class="secondary mini" data-editk="${key}">✎ Edit</button>
            <button class="mini primary ${running ? "active" : ""}" data-apply="${key}" title="Play">▷</button>
            ${canStop ? `<button class="mini secondary ${running ? "active" : ""}" data-stopk="${key}" title="Stop">◼</button>` : ""}
            <button class="mini secondary" data-delk="${key}" title="Delete">✕</button>
          </div>
        </div>
      </div>`;
  }

  _renderDetail() {
    const it = this._selectedItem();
    if (!it) return "";
    const ready = this._isReady(it);
    const running = this._isRunning(it);
    let rows = "";
    if (it.type === "custom") {
      const cols = (it.obj.lights || []).map((l) => l.hex).filter(Boolean);
      rows = `
        <div class="drow"><span>Type</span><b>Custom preset</b></div>
        <div class="drow"><span>Targets</span><b>${esc(this._targetsLabel())}</b></div>
        <div class="drow"><span>Transition</span><b>${it.obj.transition != null ? it.obj.transition + "s" : "—"}</b></div>
        <div class="drow"><span>Colours</span><span class="sw-row">${cols.map((c) => `<i class="sw" style="background:${c}"></i>`).join("")} ${cols.length}</span></div>`;
    } else if (it.type === "aqara") {
      rows = `
        <div class="drow"><span>Type</span><b>Aqara preset</b></div>
        <div class="drow"><span>Service</span><b>${esc(it.obj.service)}</b></div>
        <div class="drow"><span>Preset</span><b>${esc(it.obj.data && it.obj.data.preset)}</b></div>
        <div class="drow"><span>Targets</span><b>${esc(this._targetsLabel())}</b></div>`;
    } else {
      const bs = it.obj.bindings || [];
      rows = `<div class="drow"><span>Type</span><b>Look</b></div>
        <div class="drow"><span>Bindings</span><b>${bs.length}</b></div>
        ${bs.map((b) => `<div class="drow"><span>${(b.targets && b.targets.entity_id ? [].concat(b.targets.entity_id).length : 0)} lights</span><b>${esc(b.kind === "aqara" ? "Aqara: " + (b.aqara || "") : b.kind === "effect" ? "Effect" : "Scene: " + (b.scene || ""))}</b></div>`).join("")}`;
    }
    return `
      <div class="card detail" id="detail">
        <div class="d-head"><b>Preset Details</b><button class="x" id="d-close">✕</button></div>
        <div class="d-thumb" style="${this._gradient(it)}"></div>
        <div class="d-title">${esc(it.name)} <span class="status ${ready ? "ok" : "warn"}">${ready ? "● Ready" : "▲ Incomplete"}</span></div>
        ${rows}
        ${it.type !== "aqara" ? `<div class="drow"><span>Status</span><b class="${running ? "playing-txt" : ""}">${running ? "● Playing" : "○ Stopped"}</b></div>` : ""}
        <div class="transport">
          <button class="primary ${running ? "active" : ""}" id="d-apply" title="Play">▷ Play</button>
          ${it.type !== "aqara" ? `<button class="secondary ${running ? "active" : ""}" id="d-stop" title="Stop">◼ Stop</button>` : ""}
        </div>
        <button class="secondary block" id="d-edit">✎ Edit</button>
        ${it.type === "custom" ? `<button class="secondary block" id="d-export">⇅ Export</button>` : ""}
      </div>`;
  }

  _newPreset() { this._newOpen = true; this._render(); }
  _createNew(type) {
    this._newOpen = false;
    if (type === "aqara") { this._editingAqara = this._blankAqara(); this._view = "aqara"; }
    else if (type === "look") { this._editingLook = this._blankLook(); this._view = "look"; }
    else { this._editing = this._blankScene(); this._view = "scene"; }
    this._render();
  }

  // ---- editors (scene / aqara / look / targets / io) -----------------------

  _backBar(title) { return `<div class="topbar"><div class="brand"><h1>${esc(title)}</h1></div><div class="actions"><button class="secondary" id="back">← Back</button></div></div>`; }

  _renderSceneEditor(root) {
    const s = this._editing;
    root.innerHTML = `${this._backBar(s.slug ? "Edit scene" : "Create scene")}
      <div class="card">
        <div class="row"><label>Name</label><input type="text" id="f-name" style="flex:1;min-width:200px"></div>
        <div class="row"><label>Category</label><input type="text" id="f-cat" list="cats" placeholder="e.g. Gaming" style="min-width:200px"><datalist id="cats">${this._categories().map((c) => `<option value="${esc(c)}">`).join("")}</datalist></div>
        <div class="row"><label>Image</label><input type="file" id="f-img" accept="image/*"><span id="imgprev">${s.img ? `<img class="imgprev" src="/assets/${DOMAIN}/${s.img}">` : ""}</span></div>
        <div class="row" style="align-items:flex-start"><label>Colours</label><div style="flex:1"><div id="colors"></div><button class="secondary mini" id="add-color" style="margin-top:6px">+ Add colour</button><span class="hint"> up to ${MAX_COLORS}; ▶ previews on the current targets</span></div></div>
        <div class="row"><label>Interval (s)</label><input type="number" id="f-int" min="0" max="3600" style="width:90px"><label style="min-width:auto;margin-left:12px">Transition (s)</label><input type="number" id="f-trn" min="0" max="300" style="width:90px"><label style="min-width:auto;margin-left:12px">Shuffle</label><input type="checkbox" id="f-shuf"></div>
        <div class="row" style="margin-top:8px"><button id="b-save">${s.slug ? "Update" : "Create"} scene</button></div>
      </div>`;
    const q = (i) => root.querySelector(i);
    q("#back").addEventListener("click", () => { this._view = "browse"; this._render(); });
    q("#f-name").value = s.name; q("#f-cat").value = s.category; q("#f-int").value = s.interval; q("#f-trn").value = s.transition; q("#f-shuf").checked = !!s.shuffle;
    q("#f-name").addEventListener("input", (e) => (s.name = e.target.value));
    q("#f-cat").addEventListener("input", (e) => (s.category = e.target.value));
    q("#f-int").addEventListener("input", (e) => (s.interval = e.target.value));
    q("#f-trn").addEventListener("input", (e) => (s.transition = e.target.value));
    q("#f-shuf").addEventListener("change", (e) => (s.shuffle = e.target.checked));
    q("#f-img").addEventListener("change", (e) => { if (e.target.files && e.target.files[0]) this._uploadImage(e.target.files[0], s); });
    q("#add-color").addEventListener("click", () => { if (s.colors.length < MAX_COLORS) { s.colors.push("#ffffff"); this._renderColors(); } });
    q("#b-save").addEventListener("click", () => this._saveScene());
    this._renderColors();
  }
  _renderColors() {
    const wrap = this.shadowRoot.getElementById("colors"); if (!wrap) return; const s = this._editing; wrap.innerHTML = "";
    s.colors.forEach((hex, idx) => {
      const row = document.createElement("div"); row.className = "color-row";
      row.innerHTML = `<input type="color" value="${hex}"><code>${hex}</code><button class="mini" title="Preview">▶</button><button class="mini secondary" title="Remove">✕</button>`;
      const [picker] = row.querySelectorAll("input"); const code = row.querySelector("code"); const [prev, del] = row.querySelectorAll("button");
      picker.addEventListener("input", (e) => { s.colors[idx] = e.target.value; code.textContent = e.target.value; });
      prev.addEventListener("click", () => this._previewColors([s.colors[idx]]));
      del.addEventListener("click", () => { s.colors.splice(idx, 1); if (!s.colors.length) s.colors = ["#ffffff"]; this._renderColors(); });
      wrap.appendChild(row);
    });
  }

  _renderAqaraEditor(root) {
    const a = this._editingAqara;
    const services = [{ v: "start_dynamic_scene", l: "Dynamic Scene" }, { v: "set_dynamic_effect", l: "Dynamic Effect" }];
    const opts = this._aqaraPresetOptions(a.service); const inList = opts.some((o) => o.value === a.preset); const noAal = opts.length === 0;
    root.innerHTML = `${this._backBar(a.slug ? "Edit Aqara preset" : "Create Aqara preset")}
      <div class="card">
        <div class="hint" style="margin-bottom:8px">Reference to an Aqara Advanced Lighting action. The preset list is read live from Aqara.</div>
        <div class="row"><label>Name</label><input type="text" id="aq-name" placeholder="display name" style="flex:1;min-width:220px"></div>
        ${this._imgRow(a)}
        <div class="row"><label>Type</label><select id="aq-svc" style="min-width:220px">${services.map((x) => `<option value="${x.v}" ${a.service === x.v ? "selected" : ""}>${x.l}</option>`).join("")}</select></div>
        <div class="row"><label>Aqara preset</label>${noAal
          ? `<input type="text" id="aq-preset" placeholder="preset name" style="flex:1;min-width:240px"><span class="hint">AAL not detected — typing manually.</span>`
          : `<select id="aq-preset" style="min-width:280px"><option value="">– pick –</option>${opts.map((o) => `<option value="${esc(o.value)}" ${a.preset === o.value ? "selected" : ""}>${esc(o.label)}</option>`).join("")}${a.preset && !inList ? `<option value="${esc(a.preset)}" selected>${esc(a.preset)} (custom)</option>` : ""}</select>`}</div>
        <div class="row"><label>Brightness %</label><input type="number" id="aq-bri" min="1" max="100" placeholder="optional" style="width:120px"></div>
        <div class="row" style="margin-top:8px"><button id="aq-save">${a.slug ? "Update" : "Create"} Aqara preset</button></div>
      </div>`;
    const q = (i) => root.querySelector(i);
    q("#back").addEventListener("click", () => { this._view = "browse"; this._render(); });
    q("#aq-name").value = a.name; q("#aq-preset").value = a.preset; q("#aq-bri").value = a.brightness;
    q("#aq-name").addEventListener("input", (e) => (a.name = e.target.value));
    { const fi = root.querySelector(".f-img"); if (fi) fi.addEventListener("change", (e) => { if (e.target.files && e.target.files[0]) this._uploadImage(e.target.files[0], a); }); }
    q("#aq-svc").addEventListener("change", (e) => { a.service = e.target.value; this._render(); });
    q("#aq-preset").addEventListener("change", (e) => (a.preset = e.target.value));
    q("#aq-preset").addEventListener("input", (e) => (a.preset = e.target.value));
    q("#aq-bri").addEventListener("input", (e) => (a.brightness = e.target.value));
    q("#aq-save").addEventListener("click", () => this._saveAqara());
  }

  _renderLookEditor(root) {
    const l = this._editingLook;
    root.innerHTML = `${this._backBar(l.slug ? "Edit look" : "Create look")}
      <div class="card">
        <div class="row"><label>Name</label><input type="text" id="l-name" style="flex:1;min-width:200px"></div>
        ${this._imgRow(l)}
        <div id="bindings"></div>
        <button class="secondary mini" id="add-b" style="margin:6px 0">+ Add binding</button>
        <div class="hint">Each binding = lights → a Scene, an Aqara preset, or a raw effect service.</div>
        <div class="row" style="margin-top:8px"><button id="b-savelook">${l.slug ? "Update" : "Create"} look</button></div>
      </div>`;
    root.querySelector("#back").addEventListener("click", () => { this._view = "browse"; this._render(); });
    root.querySelector("#l-name").value = l.name;
    root.querySelector("#l-name").addEventListener("input", (e) => (l.name = e.target.value));
    { const fi = root.querySelector(".f-img"); if (fi) fi.addEventListener("change", (e) => { if (e.target.files && e.target.files[0]) this._uploadImage(e.target.files[0], l); }); }
    root.querySelector("#add-b").addEventListener("click", () => { l.bindings.push(this._blankBinding()); this._renderBindings(); });
    root.querySelector("#b-savelook").addEventListener("click", () => this._saveLook());
    this._renderBindings();
  }
  _renderBindings() {
    const wrap = this.shadowRoot.getElementById("bindings"); if (!wrap) return; const l = this._editingLook;
    wrap.innerHTML = "";
    l.bindings.forEach((b, idx) => {
      const kind = b.kind || "scene";
      // Scene bindings exclude AAL RGBIC lights; aqara/effect include all.
      const { groups, lights } = this._targetEntities(kind !== "scene");
      const checks = `<div class="targets-box" style="flex:1;min-width:240px">
        ${groups.length ? `<div class="tgt-head">Groups</div>` : ""}
        ${groups.map((g) => `<label class="tgt"><input type="checkbox" class="b-tgt" value="${g.id}" ${b.entity_ids.includes(g.id) ? "checked" : ""}> ${esc(g.label)} <span class="hint">(group)</span></label>`).join("")}
        ${groups.length ? `<div class="tgt-head">Lights</div>` : ""}
        ${lights.map((x) => `<label class="tgt"><input type="checkbox" class="b-tgt" value="${x.id}" ${b.entity_ids.includes(x.id) ? "checked" : ""}> ${esc(x.label)}</label>`).join("")}
      </div>`;
      const sceneRows = `<div class="row"><label>Scene</label><select class="b-scene" style="min-width:220px"><option value="">– pick a scene –</option>${this._presets.map((p) => `<option value="${p.slug}" ${b.scene === p.slug ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div>
        <div class="row"><label>Interval (s)</label><input type="number" class="b-int" placeholder="scene default" style="width:120px" value="${b.interval}"><label style="min-width:auto;margin-left:12px">Transition (s)</label><input type="number" class="b-trn" placeholder="scene default" style="width:120px" value="${b.transition}"></div>`;
      const aqaraRows = `<div class="row"><label>Aqara preset</label><select class="b-aqara" style="min-width:240px"><option value="">– pick –</option>${this._aqara.map((a) => `<option value="${a.slug}" ${b.aqara === a.slug ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></div>`;
      const effectRows = `<div class="row"><label>Service</label><input type="text" class="b-svc" style="flex:1;min-width:260px" value="${esc(b.service)}"></div><div class="row"><label>Effect</label><input type="text" class="b-eff" placeholder="effect name" style="min-width:200px" value="${esc(b.effect)}"></div>`;
      const rows = kind === "aqara" ? aqaraRows : kind === "effect" ? effectRows : sceneRows;
      const card = document.createElement("div"); card.className = "subcard";
      card.innerHTML = `<div class="row"><label>Type</label><select class="b-kind"><option value="scene" ${kind === "scene" ? "selected" : ""}>Scene</option><option value="aqara" ${kind === "aqara" ? "selected" : ""}>Aqara preset</option><option value="effect" ${kind === "effect" ? "selected" : ""}>Effect (raw)</option></select><button class="mini secondary b-rm" style="margin-left:auto">remove</button></div>
        <div class="row" style="align-items:flex-start"><label>${kind === "scene" ? "Lights" : "Targets"}</label>${checks}</div>${rows}`;
      card.querySelector(".b-kind").addEventListener("change", (e) => { b.kind = e.target.value; this._renderBindings(); });
      card.querySelectorAll(".b-tgt").forEach((cb) => cb.addEventListener("change", (e) => { const id = e.target.value; if (e.target.checked) { if (!b.entity_ids.includes(id)) b.entity_ids.push(id); } else b.entity_ids = b.entity_ids.filter((x) => x !== id); }));
      card.querySelector(".b-rm").addEventListener("click", () => { l.bindings.splice(idx, 1); if (!l.bindings.length) l.bindings = [this._blankBinding()]; this._renderBindings(); });
      if (kind === "aqara") card.querySelector(".b-aqara").addEventListener("change", (e) => (b.aqara = e.target.value));
      else if (kind === "effect") { card.querySelector(".b-svc").addEventListener("input", (e) => (b.service = e.target.value)); card.querySelector(".b-eff").addEventListener("input", (e) => (b.effect = e.target.value)); }
      else { card.querySelector(".b-scene").addEventListener("change", (e) => (b.scene = e.target.value)); card.querySelector(".b-int").addEventListener("input", (e) => (b.interval = e.target.value)); card.querySelector(".b-trn").addEventListener("input", (e) => (b.transition = e.target.value)); }
      wrap.appendChild(card);
    });
  }

  _renderTargetsEditor(root) {
    const t = this._tunables; const { groups, lights } = this._targetEntities(false);
    root.innerHTML = `${this._backBar("Edit Targets & Options")}
      <div class="card">
        <div class="hint" style="margin-bottom:6px">Pick lights and/or groups. (Aqara RGBIC lights aren't listed — they belong in Aqara presets/looks.)</div>
        <div class="targets-box" style="max-height:260px">
          ${groups.length ? `<div class="tgt-head">Groups</div>` : ""}
          ${groups.map((g) => `<label class="tgt"><input type="checkbox" class="g-tgt" value="${g.id}" ${this._targets.includes(g.id) ? "checked" : ""}> ${esc(g.label)} <span class="hint">(group)</span></label>`).join("")}
          ${groups.length ? `<div class="tgt-head">Lights</div>` : ""}
          ${lights.map((x) => `<label class="tgt"><input type="checkbox" class="g-tgt" value="${x.id}" ${this._targets.includes(x.id) ? "checked" : ""}> ${esc(x.label)}</label>`).join("")}
        </div>
        <div class="card-title" style="margin-top:14px">Options</div>
        <div class="tun">
          <label><input type="checkbox" id="t-dyn" ${t.dynamic ? "checked" : ""}> Dynamic (cycle)</label>
          <label><input type="checkbox" id="t-shuf" ${t.shuffle ? "checked" : ""}> Shuffle colours</label>
          <label><input type="checkbox" id="t-cbri" ${t.customBri ? "checked" : ""}> Custom brightness</label>
          <input type="range" id="t-bri" min="1" max="255" value="${t.brightness}" ${t.customBri ? "" : "disabled"}><span class="mono">${t.brightness}</span>
          <label><input type="checkbox" id="t-ctr" ${t.customTrans ? "checked" : ""}> Custom transition</label>
          <input type="number" id="t-trn" min="0" max="300" value="${t.transition}" ${t.customTrans ? "" : "disabled"} style="width:70px">
        </div>
        <div class="row" style="margin-top:8px"><button id="t-done">Done</button></div>
      </div>`;
    root.querySelector("#back").addEventListener("click", () => { this._view = "browse"; this._render(); });
    root.querySelector("#t-done").addEventListener("click", () => { this._view = "browse"; this._render(); });
    root.querySelectorAll(".g-tgt").forEach((cb) => cb.addEventListener("change", (e) => { const id = e.target.value; if (e.target.checked) { if (!this._targets.includes(id)) this._targets.push(id); } else this._targets = this._targets.filter((x) => x !== id); }));
    const q = (i) => root.querySelector(i);
    q("#t-dyn").addEventListener("change", (e) => (t.dynamic = e.target.checked));
    q("#t-shuf").addEventListener("change", (e) => (t.shuffle = e.target.checked));
    q("#t-cbri").addEventListener("change", (e) => { t.customBri = e.target.checked; this._render(); });
    q("#t-bri").addEventListener("input", (e) => { t.brightness = e.target.value; e.target.nextElementSibling.textContent = e.target.value; });
    q("#t-ctr").addEventListener("change", (e) => { t.customTrans = e.target.checked; this._render(); });
    q("#t-trn").addEventListener("input", (e) => (t.transition = e.target.value));
  }

  _renderIO(root) {
    root.innerHTML = `${this._backBar("Import / Export")}
      <div class="card">
        <div class="hint">Export a scene to a shareable string (colours + name + timing; no image). Paste a string and import.</div>
        <textarea id="io" rows="4" style="width:100%;margin-top:8px" placeholder="BSP1:…">${esc(this._ioString || "")}</textarea>
        <div class="row" style="margin-top:8px"><button id="io-import">Import into editor</button><span class="hint">Tip: open a scene's detail and hit Export to fill this.</span></div>
      </div>`;
    root.querySelector("#back").addEventListener("click", () => { this._view = "browse"; this._render(); });
    root.querySelector("#io-import").addEventListener("click", () => this._importString(root.querySelector("#io").value));
    if (this._ioString) { const ta = root.querySelector("#io"); ta.focus(); ta.select(); }
  }

  _toast(m) { const t = this.shadowRoot.getElementById("toast"); if (!t) return; t.textContent = m; t.classList.add("show"); clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove("show"), 2600); }

  _css() {
    return `
      :host { display:block; padding:14px 22px 60px; color:var(--primary-text-color); }
      h1 { font-size:20px; font-weight:600; margin:0; }
      .topbar { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:14px; }
      .brand { display:flex; align-items:center; gap:10px; } .logo { color:var(--primary-color,#3b82f6); font-size:22px; }
      .actions { display:flex; gap:8px; flex-wrap:wrap; }
      .card { background:var(--card-background-color,#15181d); border:1px solid var(--divider-color,#2a2f37); border-radius:14px; padding:16px; margin-bottom:14px; }
      .targets .t-head { display:flex; gap:10px; align-items:center; margin-bottom:10px; } .t-ico { color:var(--primary-color,#3b82f6); font-size:20px; } .t-title { font-weight:600; }
      .chips { display:flex; gap:8px; flex-wrap:wrap; } .chip { background:var(--secondary-background-color,#1e232b); border:1px solid var(--divider-color,#2a2f37); border-radius:999px; padding:6px 12px; font-size:13px; }
      .edit-t { margin-top:10px; }
      .toolbar { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:center; margin-bottom:12px; border-bottom:1px solid var(--divider-color,#2a2f37); padding-bottom:10px; }
      .tabs { display:flex; gap:4px; flex-wrap:wrap; } .tab { background:none; border:none; color:var(--secondary-text-color); padding:6px 10px; border-radius:8px; cursor:pointer; font:inherit; }
      .tab.on { color:var(--primary-text-color); border-bottom:2px solid var(--primary-color,#3b82f6); border-radius:0; }
      .tools input { padding:7px 10px; border-radius:8px; border:1px solid var(--divider-color,#2a2f37); background:var(--secondary-background-color,#1e232b); color:var(--primary-text-color); }
      .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:14px; }
      .tile { border:1px solid var(--divider-color,#2a2f37); border-radius:12px; overflow:hidden; cursor:pointer; background:var(--card-background-color,#15181d); transition:border-color .1s; }
      .tile.sel { border-color:var(--primary-color,#3b82f6); }
      .thumb { position:relative; height:120px; background-size:cover; background-position:center; }
      .star { position:absolute; top:8px; right:10px; font-size:18px; color:rgba(255,255,255,.55); cursor:pointer; text-shadow:0 1px 3px rgba(0,0,0,.7); } .star.on { color:#ffd54a; }
      .body { padding:10px 12px; } .name { font-weight:600; margin-bottom:6px; }
      .meta { display:flex; gap:8px; align-items:center; margin-bottom:8px; font-size:12px; }
      .badge { padding:2px 8px; border-radius:6px; background:var(--secondary-background-color,#1e232b); color:var(--secondary-text-color); }
      .badge.aqara { color:#5eead4; } .badge.look { color:#a5b4fc; }
      .status { font-size:12px; } .status.ok { color:#4ade80; } .status.warn { color:#fbbf24; }
      .tile-actions { gap:6px; }
      .row { display:flex; gap:8px; align-items:center; margin-bottom:10px; flex-wrap:wrap; }
      label { font-size:13px; color:var(--secondary-text-color); min-width:90px; }
      input[type=text], input[type=number], select, textarea { padding:7px 9px; border-radius:7px; border:1px solid var(--divider-color,#2a2f37); background:var(--secondary-background-color,#1e232b); color:var(--primary-text-color); font:inherit; }
      input[type=color] { width:42px; height:32px; border:none; background:none; padding:0; cursor:pointer; }
      button { padding:7px 14px; border-radius:8px; border:none; cursor:pointer; font:inherit; background:var(--primary-color,#3b82f6); color:#fff; }
      button.secondary { background:var(--secondary-background-color,#1e232b); color:var(--primary-text-color); border:1px solid var(--divider-color,#2a2f37); }
      button.mini { padding:5px 10px; font-size:12px; } button.primary { background:var(--primary-color,#3b82f6); }
      button.danger { color:#f87171; border-color:#f8717155; }
      button.active { box-shadow:0 0 0 2px var(--primary-color,#3b82f6) inset; }
      .transport { display:flex; gap:8px; margin-top:8px; } .transport button { flex:1; }
      .tile.playing { border-color:#4ade80; }
      .playing-badge { position:absolute; bottom:8px; left:10px; font-size:11px; font-weight:600; color:#fff; background:#16a34acc; padding:2px 8px; border-radius:999px; text-shadow:0 1px 2px rgba(0,0,0,.6); }
      .playing-txt { color:#4ade80; }
      .footer { display:flex; gap:18px; color:var(--secondary-text-color); font-size:13px; padding:6px 2px; } .footer .warn { color:#fbbf24; }
      .detail { position:fixed; top:14px; right:14px; width:340px; max-height:92vh; overflow:auto; box-shadow:0 8px 30px rgba(0,0,0,.4); }
      .d-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; } .d-head .x { background:none; border:none; color:var(--secondary-text-color); cursor:pointer; }
      .d-thumb { height:150px; border-radius:10px; background-size:cover; background-position:center; margin-bottom:10px; }
      .d-title { font-size:17px; font-weight:600; margin-bottom:10px; }
      .drow { display:flex; justify-content:space-between; gap:10px; padding:7px 0; border-top:1px solid var(--divider-color,#2a2f37); font-size:13px; } .drow span { color:var(--secondary-text-color); }
      .sw-row { display:flex; gap:3px; align-items:center; } .sw { width:14px; height:14px; border-radius:3px; display:inline-block; }
      .block { display:block; width:100%; margin-top:8px; }
      .subcard { background:var(--secondary-background-color,#1e232b); border-radius:10px; padding:12px; margin-bottom:10px; }
      .targets-box { max-height:200px; overflow:auto; border:1px solid var(--divider-color,#2a2f37); border-radius:8px; padding:8px; }
      .tgt { display:flex; align-items:center; gap:8px; padding:3px 4px; font-size:14px; cursor:pointer; } .tgt:hover { background:var(--card-background-color,#15181d); border-radius:6px; } .tgt input { min-width:auto; }
      .tgt-head { font-size:12px; font-weight:600; color:var(--secondary-text-color); margin:8px 2px 2px; }
      .tun { display:flex; gap:14px; align-items:center; flex-wrap:wrap; } .tun label { display:flex; gap:6px; align-items:center; min-width:auto; }
      .color-row { display:flex; align-items:center; gap:8px; margin-bottom:6px; } .color-row code { font-family:monospace; }
      .imgprev { width:120px; height:70px; object-fit:cover; border-radius:8px; }
      .hint { font-size:12px; color:var(--secondary-text-color); } .pad { padding:10px 2px; } .mono { font-family:monospace; }
      .overlay { position:fixed; inset:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; z-index:30; }
      .modal { background:var(--card-background-color,#15181d); border:1px solid var(--divider-color,#2a2f37); border-radius:14px; padding:20px; min-width:320px; box-shadow:0 10px 40px rgba(0,0,0,.5); }
      .modal h3 { margin:0 0 14px; }
      #toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:#323232; color:#fff; padding:10px 18px; border-radius:8px; opacity:0; transition:opacity .2s; pointer-events:none; z-index:20; } #toast.show { opacity:1; }
    `;
  }
}

customElements.define("benni-scene-presets-panel", BenniScenePresetsPanel);
