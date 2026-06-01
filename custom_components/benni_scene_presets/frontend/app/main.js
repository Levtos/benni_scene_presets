// Entry module for the new modular panel (registered as <bsp-new-app>).
// Builds the shell (sidebar + routed main view), owns UI state, and delegates
// all clicks/inputs. Screens live in ./views/*. Runs alongside the legacy panel
// during the screen-by-screen rebuild; we swap the registration once it's done.
//
// Cache-busting: the panel is loaded with a ?<mtime> query (see view.py). We
// reuse that query on the dynamic imports so sibling modules bust together.

const VER = new URL(import.meta.url).search; // e.g. "?1717230000"
const FAV_KEY = "bsp_new_favorites";

const NAV = [
  { kind: "label", text: "Library" },
  { id: "overview", icon: "▦", text: "Overview", ready: true },
  { id: "rgb", icon: "🎨", text: "RGB Scenes" },
  { id: "kelvin", icon: "🌡", text: "Kelvin Scenes" },
  { id: "aqara", icon: "◎", text: "Aqara Ring Effects" },
  { kind: "label", text: "Compose" },
  { id: "composer", icon: "⚙", text: "Look Composer" },
  { id: "io", icon: "⇅", text: "Import / Export" },
  { id: "settings", icon: "⚙", text: "Settings" },
];

class BspNewApp extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._init = false;
    this.ui = { section: "overview", search: "", filter: "all", selected: null };
    this.favs = this._loadFavs();
    this._views = {};
  }

  set hass(h) {
    this._hass = h;
    if (this.store) this.store.setHass(h);
    if (!this._init) { this._boot(); return; }
    this._liveUpdate();
  }
  get hass() { return this._hass; }

  _loadFavs() { try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]")); } catch { return new Set(); } }
  _saveFavs() { localStorage.setItem(FAV_KEY, JSON.stringify([...this.favs])); }

  async _boot() {
    this._init = true;
    const [storeMod, stylesMod, overview] = await Promise.all([
      import("./store.js" + VER),
      import("./styles.js" + VER),
      import("./views/overview.js" + VER),
    ]);
    this._styles = stylesMod.STYLES;
    this.store = new storeMod.Store();
    this.store.setHass(this._hass);
    this._views.overview = overview;
    await this.store.refresh();
    this._mount();
    this._render();
  }

  _mount() {
    this.shadowRoot.innerHTML = `<style>${this._styles}</style><div id="root"></div><div class="toast" id="toast"></div>`;
    const root = this.shadowRoot.getElementById("root");
    root.addEventListener("click", (e) => this._onClick(e));
    root.addEventListener("input", (e) => this._onInput(e));
  }

  _ctx() { return { store: this.store, ui: this.ui, favs: this.favs, hass: this._hass }; }

  // Re-render the grid when a look switch flips, unless the user is typing.
  _liveUpdate() {
    if (!this.store || this.ui.section !== "overview") return;
    const sig = this.store.looks.map((l) => (this.store.isLookRunning(l.slug) ? "1" : "0")).join("");
    if (sig === this._runSig) return;
    this._runSig = sig;
    const active = this.shadowRoot.activeElement;
    if (active && active.tagName === "INPUT") return;
    this._render();
  }

  _sidebar() {
    const items = NAV.map((n) => {
      if (n.kind === "label") return `<div class="label">${n.text}</div>`;
      const active = this.ui.section === n.id ? " active" : "";
      return `<a class="${active.trim()}" data-nav="${n.id}"><span class="ic">${n.icon}</span><span>${n.text}</span></a>`;
    }).join("");
    const running = this.store.dynamic.length + this.store.looks.filter((l) => this.store.isLookRunning(l.slug)).length;
    const ver = (this._hass && this._hass.panels && this._hass.panels.benni_scene_presets && this._hass.panels.benni_scene_presets.config && this._hass.panels.benni_scene_presets.config.version) || "";
    return `
    <aside class="sidebar">
      <div class="brand"><div class="logo">B</div><div><div class="title">Benni Scene Presets</div><div class="ver">New UX${ver ? " · v" + ver : ""}</div></div></div>
      <nav class="nav">${items}</nav>
      <div class="foot">
        <div class="status-card">
          <div class="hdr">System Status</div>
          <div class="ln"><span class="dot ${running ? "green" : "grey"}"></span>${running} running scene${running === 1 ? "" : "s"}</div>
        </div>
      </div>
    </aside>`;
  }

  _content() {
    const view = this._views[this.ui.section];
    if (view && view.render) return view.render(this._ctx());
    const titles = { rgb: "RGB Scenes", kelvin: "Kelvin Scenes", aqara: "Aqara Ring Effects", composer: "Look Composer", io: "Import / Export", settings: "Settings" };
    return `<div class="placeholder"><div class="big">${titles[this.ui.section] || "Screen"}</div><div>This screen is part of the new UX rebuild and isn't wired up yet.<br>We build it in a later step — the classic panel still has it.</div></div>`;
  }

  _render() {
    const root = this.shadowRoot.getElementById("root");
    root.innerHTML = `<div class="app">${this._sidebar()}<main class="main">${this._content()}</main></div>`;
  }

  // ---- events ----
  _onInput(e) {
    const el = e.target.closest("[data-input]");
    if (!el) return;
    if (el.dataset.input === "search") { this.ui.search = el.value; this._renderMainOnly(); }
  }
  // Re-render just the main column so the focused search input is preserved.
  _renderMainOnly() {
    const main = this.shadowRoot.querySelector(".main");
    if (!main) return this._render();
    const sel = main.querySelector('[data-input="search"]');
    const caret = sel ? sel.selectionStart : null;
    main.innerHTML = this._content();
    const inp = main.querySelector('[data-input="search"]');
    if (inp) { inp.focus(); if (caret != null) inp.setSelectionRange(caret, caret); }
  }

  async _onClick(e) {
    const t = (sel) => e.target.closest(sel);
    let el;
    if ((el = t("[data-nav]"))) { this.ui.section = el.dataset.nav; this.ui.search = ""; this._render(); return; }
    if ((el = t("[data-filter]"))) { this.ui.filter = el.dataset.filter; this._renderMainOnly(); return; }
    if ((el = t("[data-fav]"))) { e.stopPropagation(); const s = el.dataset.fav; this.favs.has(s) ? this.favs.delete(s) : this.favs.add(s); this._saveFavs(); this._renderMainOnly(); return; }
    if ((el = t("[data-copy]"))) { e.stopPropagation(); try { await navigator.clipboard.writeText(el.dataset.copy); this._toast("Copied."); } catch {} return; }
    if ((el = t("[data-play]"))) { e.stopPropagation(); await this._play(el.dataset.play); return; }
    if ((el = t("[data-stop]"))) { e.stopPropagation(); await this._stop(el.dataset.stop); return; }
    if ((el = t("[data-edit]"))) { e.stopPropagation(); this.ui.section = "composer"; this._render(); this._toast("Look Composer kommt in einem späteren Schritt."); return; }
    if ((el = t("[data-del]"))) { e.stopPropagation(); await this._delete(el.dataset.del); return; }
    if ((el = t("[data-new]"))) { e.stopPropagation(); this.ui.section = "composer"; this._render(); this._toast("Look Composer kommt in einem späteren Schritt."); return; }
    if ((el = t("[data-act]"))) {
      e.stopPropagation();
      if (el.dataset.act === "stop-all") { try { await this.store.stopAll(); this._toast("All scenes stopped."); } catch (err) { this._toast(`Failed: ${err.message || err}`); } await this._refresh(); }
      if (el.dataset.act === "off-all") { try { const n = await this.store.offAll(); this._toast(`Stopped & turned off ${n} light${n === 1 ? "" : "s"}.`); } catch (err) { this._toast(`Failed: ${err.message || err}`); } await this._refresh(); }
      return;
    }
    if ((el = t("[data-look]"))) { this.ui.selected = el.dataset.look; this._renderMainOnly(); return; }
  }

  async _play(slug) {
    const look = this.store.looks.find((l) => l.slug === slug);
    try { await this.store.applyLook(slug); this._toast(`Look "${look ? look.name : slug}" applied.`); }
    catch (err) { this._toast(`Apply failed: ${err.message || err}`); }
    await this._refresh();
  }
  async _stop(slug) {
    try { await this.store.stopLook(slug); this._toast("Stopped."); }
    catch (err) { this._toast(`Stop failed: ${err.message || err}`); }
    await this._refresh();
  }
  async _delete(slug) {
    const look = this.store.looks.find((l) => l.slug === slug);
    if (!confirm(`Delete look "${look ? look.name : slug}"?`)) return;
    try { await this.store.deleteLook(slug); this._toast("Deleted."); if (this.ui.selected === slug) this.ui.selected = null; }
    catch (err) { this._toast(`Delete failed: ${err.message || err}`); }
    await this._refresh();
  }
  async _refresh() { await this.store.refresh(); this._runSig = null; this._render(); }

  _toast(msg) {
    const el = this.shadowRoot.getElementById("toast");
    if (!el) return;
    el.textContent = msg; el.classList.add("show");
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.classList.remove("show"), 2600);
  }
}

if (!customElements.get("bsp-new-app")) customElements.define("bsp-new-app", BspNewApp);
