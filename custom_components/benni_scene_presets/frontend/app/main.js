// Entry module for the modular panel (registered as <bsp-new-app>).
// Builds the shell (sidebar + routed main view), owns UI state, and delegates
// all clicks/inputs to the active view. Screens live in ./views/*.
//
// Cache-busting: the panel is loaded with a ?<mtime> query (see view.py). We
// reuse that query on the dynamic imports so sibling modules bust together.

const VER = new URL(import.meta.url).search; // e.g. "?1717230000"
const FAV_KEY = "bsp_new_favorites";

// Brand glyph: the integration's own icon (from res/iconset.js), drawn white
// on the gradient tile in the top-left corner.
const BRAND_PATH = "M3.121-.014A3.121 3.121 0 0 0 0 3.11 3.121 3.121 0 0 0 3.121 6.23a3.121 3.121 0 0 0 3.121-3.12 3.121 3.121 0 0 0-3.12-3.124zm17.758 0a3.121 3.121 0 0 0-3.121 3.123 3.121 3.121 0 0 0 3.121 3.121A3.121 3.121 0 0 0 24 3.11a3.121 3.121 0 0 0-3.12-3.124zM12 1.287a.52.52 0 0 0-.52.522v2.6a.52.52 0 1 0 1.04 0v-2.6a.52.52 0 0 0-.52-.522zm0 4.772a5.927 5.927 0 0 0-4.468 9.824c.094.12.194.239.3.361.607.697.9 1.132 1.272 1.893.113.23.188.37.256.474.033.07.084.13.148.18l.006.006a.693.693 0 0 0 .422.137h4.125c.16 0 .306-.05.416-.131l.021-.018.024-.02a.542.542 0 0 0 .086-.099l.008-.014c.073-.104.154-.257.28-.515.373-.76.666-1.196 1.272-1.893.107-.122.206-.241.301-.361A5.93 5.93 0 0 0 12 6.059zM1.82 11.467c-.288 0-.52.231-.52.52s.232.52.52.52h2.602a.52.52 0 0 0 0-1.04H1.82zm17.758 0c-.288 0-.52.231-.52.52s.232.52.52.52h2.602a.52.52 0 0 0 0-1.04h-2.602zM3.121 17.744a3.121 3.121 0 0 0-3.12 3.121 3.121 3.121 0 0 0 3.12 3.121 3.121 3.121 0 0 0 3.121-3.12 3.121 3.121 0 0 0-3.12-3.122zm17.758 0a3.121 3.121 0 0 0-3.12 3.121 3.121 3.121 0 0 0 3.12 3.121A3.121 3.121 0 0 0 24 20.866a3.121 3.121 0 0 0-3.12-3.122zm-10.838 2.08a.521.521 0 1 0 0 1.041H13.96a.52.52 0 1 0 0-1.04h-3.918zm.147 1.944c-.279 0-.502.223-.502.502s.223.503.502.503h.107c.097.001.11.015.131.135.082.47.38.85.783 1 .338.126 1.117.14 1.496.028.45-.135.782-.527.87-1.028.02-.12.034-.134.13-.134h.108a.502.502 0 1 0 0-1.006h-3.625z";

const NAV = [
  { kind: "label", text: "Library" },
  { id: "overview", icon: "▦", text: "Overview" },
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
    this.ui = {
      section: "overview", search: "", filter: "all", category: "all", selected: null,
      editing: null,      // scene editor working copy
      editingLook: null,  // look composer working copy
      drawer: null,       // target picker drawer state
      io: null,           // import/export state
      testTargets: this._loadTestTargets(), // lights used for previews
    };
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
  _loadTestTargets() { try { return JSON.parse(localStorage.getItem("bsp_new_testtargets") || "[]"); } catch { return []; } }
  saveTestTargets(ids) { this.ui.testTargets = ids; try { localStorage.setItem("bsp_new_testtargets", JSON.stringify(ids)); } catch {} }

  async _boot() {
    this._init = true;
    const [storeMod, stylesMod, drawer, overview, scenes, aqara, editor, composer, io, settings] = await Promise.all([
      import("./store.js" + VER),
      import("./styles.js" + VER),
      import("./components/drawer.js" + VER),
      import("./views/overview.js" + VER),
      import("./views/scenes.js" + VER),
      import("./views/aqara.js" + VER),
      import("./views/scene-editor.js" + VER),
      import("./views/composer.js" + VER),
      import("./views/io.js" + VER),
      import("./views/settings.js" + VER),
    ]);
    this._styles = stylesMod.STYLES;
    this._drawer = drawer;
    this.store = new storeMod.Store();
    this.store.setHass(this._hass);
    this._views = { overview, scenes, aqara, editor, composer, io, settings };
    await this.store.refresh();
    this._mount();
    this._render();
  }

  _mount() {
    this.shadowRoot.innerHTML = `<style>${this._styles}</style><div id="root"></div><div class="toast" id="toast"></div>`;
    const root = this.shadowRoot.getElementById("root");
    root.addEventListener("click", (e) => this._onClick(e));
    root.addEventListener("input", (e) => this._onInput(e));
    root.addEventListener("change", (e) => this._onChange(e));
    root.addEventListener("keydown", (e) => { if (e.key === "Escape" && this.ui.drawer) { this.ui.drawer = null; this._renderMain(); } });
  }

  // Helpers handed to every view.
  _ctx() {
    return {
      store: this.store, hass: this._hass, ui: this.ui, favs: this.favs,
      toast: (m) => this._toast(m),
      refresh: () => this._refresh(),
      render: () => this._render(),
      renderMain: () => this._renderMain(),
      navigate: (section) => { this.ui.section = section; this._render(); },
      copy: (t) => this._copy(t),
      openDrawer: (opts) => this._drawer.openDrawer(this._ctx(), opts),
      saveTestTargets: (ids) => this.saveTestTargets(ids),
      views: this._views,
    };
  }

  _activeView() {
    const s = this.ui.section;
    if (s === "rgb" || s === "kelvin") return this._views.scenes;
    if (s === "editor") return this._views.editor;
    if (s === "aqara") return this._views.aqara;
    if (s === "composer") return this._views.composer;
    if (s === "io") return this._views.io;
    if (s === "settings") return this._views.settings;
    return this._views.overview;
  }
  _activeNav() {
    const s = this.ui.section;
    if (s === "editor") return this.ui.editing && this.ui.editing.mode === "kelvin" ? "kelvin" : "rgb";
    return s;
  }

  _liveUpdate() {
    if (!this.store) return;
    if (this.ui.section !== "overview") return;
    const sig = this.store.looks.map((l) => (this.store.isLookRunning(l.slug) ? "1" : "0")).join("");
    if (sig === this._runSig) return;
    this._runSig = sig;
    const active = this.shadowRoot.activeElement;
    if (active && active.tagName === "INPUT") return;
    this._render();
  }

  _sidebar() {
    const activeNav = this._activeNav();
    const items = NAV.map((n) => {
      if (n.kind === "label") return `<div class="label">${n.text}</div>`;
      const active = activeNav === n.id ? " active" : "";
      return `<a class="${active.trim()}" data-nav="${n.id}"><span class="ic">${n.icon}</span><span>${n.text}</span></a>`;
    }).join("");
    const running = this.store.dynamic.length + this.store.looks.filter((l) => this.store.isLookRunning(l.slug)).length;
    return `
    <aside class="sidebar">
      <div class="brand">
        <div class="logo"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="${BRAND_PATH}"/></svg></div>
        <div><div class="title">Benni Scene Presets</div><div class="ver">New UX</div></div>
      </div>
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
    const ctx = this._ctx();
    const view = this._activeView();
    let html;
    try { html = view.render(ctx); }
    catch (e) { html = `<div class="placeholder"><div class="big">Render error</div><div>${String(e && e.message || e)}</div></div>`; }
    if (this.ui.drawer) html += this._drawer.renderDrawer(ctx);
    return html;
  }

  _render() {
    if (!this.shadowRoot.getElementById("root")) return;
    const root = this.shadowRoot.getElementById("root");
    root.innerHTML = `<div class="app">${this._sidebar()}<main class="main">${this._content()}</main></div>`;
  }
  // Re-render just the main column, restoring focus/caret of any focused
  // [data-input] field (main search, drawer search, …).
  _renderMain() {
    const main = this.shadowRoot.querySelector(".main");
    if (!main) return this._render();
    const ae = this.shadowRoot.activeElement;
    const key = ae && ae.getAttribute && ae.getAttribute("data-input");
    let caret = null; try { caret = ae ? ae.selectionStart : null; } catch {}
    main.innerHTML = this._content();
    if (key) {
      const inp = this.shadowRoot.querySelector(`[data-input="${key}"]`);
      if (inp) { inp.focus(); try { if (caret != null) inp.setSelectionRange(caret, caret); } catch {} }
    }
  }

  // ---- event delegation ----
  _onClick(e) {
    const t = (sel) => e.target.closest(sel);
    let el;
    if (this.ui.drawer && this._drawer.onDrawerClick(this._ctx(), e)) return;
    if ((el = t("[data-nav]"))) {
      const sec = el.dataset.nav;
      this.ui.section = sec; this.ui.search = ""; this.ui.filter = "all"; this.ui.category = "all"; this.ui.selected = null; this.ui.drawer = null;
      if (sec === "composer") this._views.composer.startNew(this._ctx());
      if (sec === "io") this._views.io.init(this._ctx());
      this._render();
      return;
    }
    if ((el = t("[data-fav]"))) { e.stopPropagation(); const s = el.dataset.fav; this.favs.has(s) ? this.favs.delete(s) : this.favs.add(s); this._saveFavs(); this._renderMain(); return; }
    if ((el = t("[data-copy]"))) { e.stopPropagation(); this._copy(el.dataset.copy); return; }
    // Otherwise hand off to the active view.
    const view = this._activeView();
    if (view.onClick) view.onClick(this._ctx(), e);
  }
  _onInput(e) {
    if (this.ui.drawer && this._drawer.onDrawerInput(this._ctx(), e)) return;
    if (e.target.closest('[data-input="search"]')) { this.ui.search = e.target.value; this._renderMain(); return; }
    const view = this._activeView();
    if (view.onInput) view.onInput(this._ctx(), e);
  }
  _onChange(e) {
    const view = this._activeView();
    if (view.onChange) view.onChange(this._ctx(), e);
  }

  async _refresh() { await this.store.refresh(); this._runSig = null; this._render(); }

  async _copy(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
      else { const ta = document.createElement("textarea"); ta.value = text; this.shadowRoot.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
      this._toast("Copied.");
    } catch { this._toast(`Copy failed: ${text}`); }
  }

  _toast(msg) {
    const el = this.shadowRoot.getElementById("toast");
    if (!el) return;
    el.textContent = msg; el.classList.add("show");
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.classList.remove("show"), 2800);
  }
}

if (!customElements.get("bsp-new-app")) customElements.define("bsp-new-app", BspNewApp);
