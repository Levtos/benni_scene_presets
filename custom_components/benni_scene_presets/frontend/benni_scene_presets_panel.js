// Benni Scene Presets - custom panel (framework-free web component).
// Lists custom scenes and provides a creator/editor: name, image upload,
// up to 10 colours via colour picker, interval + transition, and a live
// preview onto a chosen light. Brightness is intentionally omitted - it is
// supplied at runtime by the light policy / day phase.

const DOMAIN = "benni_scene_presets";
const MAX_COLORS = 10;

class BenniScenePresetsPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._initialized = false;
    this._presets = [];
    this._editing = this._blankScene();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._initialized) {
      this._initialized = true;
      this._renderShell();
      this._refresh();
    }
  }

  get hass() {
    return this._hass;
  }

  _blankScene() {
    return {
      preset_id: null,
      name: "",
      img: null,
      colors: ["#ff8800"],
      interval: 300,
      transition: 60,
      shuffle: true,
    };
  }

  // ---- data ----------------------------------------------------------------

  async _refresh() {
    try {
      const data = await this._hass.callWS({ type: `${DOMAIN}/list_presets` });
      this._presets = (data.presets || []).filter((p) => p.custom);
    } catch (err) {
      this._presets = [];
      this._toast(`Could not load scenes: ${err.message || err}`);
    }
    this._renderList();
  }

  async _save() {
    const s = this._editing;
    if (!s.name.trim()) {
      this._toast("Please enter a name.");
      return;
    }
    if (!s.colors.length) {
      this._toast("Add at least one colour.");
      return;
    }
    try {
      const msg = {
        type: `${DOMAIN}/save_preset`,
        name: s.name.trim(),
        colors: s.colors,
        interval: Number(s.interval),
        transition: Number(s.transition),
        shuffle: !!s.shuffle,
      };
      if (s.preset_id) msg.preset_id = s.preset_id;
      if (s.img) msg.img = s.img;
      await this._hass.callWS(msg);
      this._toast("Saved.");
      this._editing = this._blankScene();
      this._renderEditor();
      this._refresh();
    } catch (err) {
      this._toast(`Save failed: ${err.message || err}`);
    }
  }

  async _delete(presetId) {
    if (!confirm("Delete this scene?")) return;
    try {
      await this._hass.callWS({ type: `${DOMAIN}/delete_preset`, preset_id: presetId });
      this._toast("Deleted.");
      this._refresh();
    } catch (err) {
      this._toast(`Delete failed: ${err.message || err}`);
    }
  }

  async _preview() {
    const target = this.shadowRoot.getElementById("preview-target").value;
    if (!target) {
      this._toast("Pick a light to preview on.");
      return;
    }
    try {
      await this._hass.callWS({
        type: `${DOMAIN}/apply_preview`,
        targets: { entity_id: [target] },
        colors: this._editing.colors,
        transition: 1,
      });
    } catch (err) {
      this._toast(`Preview failed: ${err.message || err}`);
    }
  }

  async _uploadImage(file) {
    const form = new FormData();
    form.append("file", file);
    try {
      const resp = await fetch(`/api/${DOMAIN}/upload_image`, {
        method: "POST",
        body: form,
        headers: { Authorization: `Bearer ${this._hass.auth.data.access_token}` },
      });
      if (!resp.ok) throw new Error(await resp.text());
      const json = await resp.json();
      this._editing.img = json.img;
      this._renderImagePreview();
      this._toast("Image uploaded.");
    } catch (err) {
      this._toast(`Upload failed: ${err.message || err}`);
    }
  }

  _edit(preset) {
    this._editing = {
      preset_id: preset.id,
      name: preset.name || "",
      img: preset.img || null,
      colors: (preset.lights || []).map((l) => l.hex || this._xyHexFallback()),
      interval: preset.interval != null ? preset.interval : 300,
      transition: preset.transition != null ? preset.transition : 60,
      shuffle: preset.shuffle != null ? preset.shuffle : true,
    };
    if (!this._editing.colors.length) this._editing.colors = ["#ff8800"];
    this._renderEditor();
    this.shadowRoot.getElementById("editor").scrollIntoView({ behavior: "smooth" });
  }

  _xyHexFallback() {
    // Older presets may only carry x/y. We cannot losslessly recover the hex,
    // so fall back to a neutral colour the user can re-pick.
    return "#ffffff";
  }

  // ---- rendering -----------------------------------------------------------

  _renderShell() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; padding: 16px 24px 64px; color: var(--primary-text-color); }
        h1 { font-size: 22px; font-weight: 500; }
        h2 { font-size: 16px; font-weight: 500; margin: 24px 0 8px; }
        .card {
          background: var(--card-background-color, #fff);
          border-radius: 12px; padding: 16px; margin-bottom: 16px;
          box-shadow: var(--ha-card-box-shadow, 0 2px 4px rgba(0,0,0,.1));
        }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
        .scene {
          border: 1px solid var(--divider-color, #e0e0e0); border-radius: 10px; overflow: hidden;
          display: flex; flex-direction: column;
        }
        .scene img, .scene .noimg {
          width: 100%; height: 90px; object-fit: cover; background: var(--secondary-background-color,#eee);
          display: flex; align-items: center; justify-content: center; color: var(--secondary-text-color);
        }
        .scene .body { padding: 8px; display: flex; flex-direction: column; gap: 6px; }
        .scene .name { font-weight: 500; }
        .swatches { display: flex; gap: 3px; flex-wrap: wrap; }
        .sw { width: 14px; height: 14px; border-radius: 3px; border: 1px solid rgba(0,0,0,.2); }
        .row { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
        label { font-size: 13px; color: var(--secondary-text-color); min-width: 90px; }
        input[type=text], input[type=number], select {
          padding: 7px 9px; border-radius: 7px; border: 1px solid var(--divider-color,#ccc);
          background: var(--card-background-color,#fff); color: var(--primary-text-color); font: inherit;
        }
        input[type=color] { width: 42px; height: 32px; border: none; background: none; padding: 0; cursor: pointer; }
        button {
          padding: 7px 14px; border-radius: 8px; border: none; cursor: pointer; font: inherit;
          background: var(--primary-color, #03a9f4); color: var(--text-primary-color, #fff);
        }
        button.secondary { background: var(--secondary-background-color,#e0e0e0); color: var(--primary-text-color); }
        button.danger { background: var(--error-color, #db4437); color: #fff; }
        button.icon { padding: 4px 8px; font-size: 12px; }
        .color-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
        .color-row code { font-family: monospace; }
        .imgprev { width: 120px; height: 70px; object-fit: cover; border-radius: 8px; border:1px solid var(--divider-color,#ccc); }
        #toast {
          position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
          background: #323232; color: #fff; padding: 10px 18px; border-radius: 8px; opacity: 0;
          transition: opacity .2s; pointer-events: none; z-index: 10;
        }
        #toast.show { opacity: 1; }
        .hint { font-size: 12px; color: var(--secondary-text-color); }
      </style>

      <h1>Benni Scene Presets</h1>

      <h2>Your scenes</h2>
      <div class="card"><div class="grid" id="list"></div></div>

      <h2 id="editor-title">Create scene</h2>
      <div class="card" id="editor"></div>

      <div id="toast"></div>
    `;
    this._renderEditor();
  }

  _renderList() {
    const list = this.shadowRoot.getElementById("list");
    if (!list) return;
    if (!this._presets.length) {
      list.innerHTML = `<div class="hint">No custom scenes yet. Create one below.</div>`;
      return;
    }
    list.innerHTML = "";
    this._presets.forEach((p) => {
      const card = document.createElement("div");
      card.className = "scene";
      const swatches = (p.lights || [])
        .map((l) => `<span class="sw" style="background:${l.hex || "#fff"}"></span>`)
        .join("");
      const imgHtml = p.img
        ? `<img src="/assets/${DOMAIN}/${p.img}" alt="">`
        : `<div class="noimg">no image</div>`;
      card.innerHTML = `
        ${imgHtml}
        <div class="body">
          <span class="name"></span>
          <div class="swatches">${swatches}</div>
          <div class="row" style="margin:0">
            <button class="icon secondary" data-act="edit">Edit</button>
            <button class="icon danger" data-act="del">Delete</button>
          </div>
        </div>`;
      card.querySelector(".name").textContent = p.name || "(unnamed)";
      card.querySelector('[data-act="edit"]').addEventListener("click", () => this._edit(p));
      card.querySelector('[data-act="del"]').addEventListener("click", () => this._delete(p.id));
      list.appendChild(card);
    });
  }

  _renderEditor() {
    const ed = this.shadowRoot.getElementById("editor");
    if (!ed) return;
    const s = this._editing;
    this.shadowRoot.getElementById("editor-title").textContent = s.preset_id
      ? "Edit scene"
      : "Create scene";

    const lights = Object.keys(this._hass.states || {})
      .filter((id) => id.startsWith("light."))
      .sort();

    ed.innerHTML = `
      <div class="row">
        <label>Name</label>
        <input type="text" id="f-name" style="flex:1; min-width:200px">
      </div>
      <div class="row">
        <label>Image</label>
        <input type="file" id="f-img" accept="image/*">
        <span id="imgprev-wrap"></span>
      </div>
      <div class="row" style="align-items:flex-start">
        <label>Colours</label>
        <div style="flex:1">
          <div id="colors"></div>
          <button class="secondary icon" id="add-color" style="margin-top:6px">+ Add colour</button>
          <div class="hint">Up to ${MAX_COLORS}. Converted to xy on save.</div>
        </div>
      </div>
      <div class="row">
        <label>Interval (s)</label>
        <input type="number" id="f-interval" min="0" max="3600" style="width:90px">
        <label style="min-width:auto; margin-left:12px">Transition (s)</label>
        <input type="number" id="f-transition" min="0" max="300" style="width:90px">
        <label style="min-width:auto; margin-left:12px">Shuffle</label>
        <input type="checkbox" id="f-shuffle">
      </div>
      <div class="row">
        <label>Preview on</label>
        <select id="preview-target" style="min-width:220px">
          <option value="">- pick a light -</option>
          ${lights.map((id) => `<option value="${id}">${id}</option>`).join("")}
        </select>
        <button class="secondary" id="btn-preview">Test</button>
      </div>
      <div class="row" style="margin-top:8px">
        <button id="btn-save">${s.preset_id ? "Update" : "Create"} scene</button>
        <button class="secondary" id="btn-cancel">Clear</button>
      </div>
    `;

    ed.querySelector("#f-name").value = s.name;
    ed.querySelector("#f-interval").value = s.interval;
    ed.querySelector("#f-transition").value = s.transition;
    ed.querySelector("#f-shuffle").checked = !!s.shuffle;

    ed.querySelector("#f-name").addEventListener("input", (e) => (s.name = e.target.value));
    ed.querySelector("#f-interval").addEventListener("input", (e) => (s.interval = e.target.value));
    ed.querySelector("#f-transition").addEventListener("input", (e) => (s.transition = e.target.value));
    ed.querySelector("#f-shuffle").addEventListener("change", (e) => (s.shuffle = e.target.checked));
    ed.querySelector("#f-img").addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) this._uploadImage(e.target.files[0]);
    });
    ed.querySelector("#add-color").addEventListener("click", () => {
      if (s.colors.length < MAX_COLORS) {
        s.colors.push("#ffffff");
        this._renderColors();
      }
    });
    ed.querySelector("#btn-save").addEventListener("click", () => this._save());
    ed.querySelector("#btn-cancel").addEventListener("click", () => {
      this._editing = this._blankScene();
      this._renderEditor();
    });
    ed.querySelector("#btn-preview").addEventListener("click", () => this._preview());

    this._renderColors();
    this._renderImagePreview();
  }

  _renderColors() {
    const wrap = this.shadowRoot.getElementById("colors");
    if (!wrap) return;
    const s = this._editing;
    wrap.innerHTML = "";
    s.colors.forEach((hex, idx) => {
      const row = document.createElement("div");
      row.className = "color-row";
      row.innerHTML = `
        <input type="color" value="${hex}">
        <code>${hex}</code>
        <button class="icon secondary" title="Remove">x</button>`;
      const picker = row.querySelector('input[type=color]');
      const code = row.querySelector("code");
      picker.addEventListener("input", (e) => {
        s.colors[idx] = e.target.value;
        code.textContent = e.target.value;
      });
      row.querySelector("button").addEventListener("click", () => {
        s.colors.splice(idx, 1);
        if (!s.colors.length) s.colors = ["#ffffff"];
        this._renderColors();
      });
      wrap.appendChild(row);
    });
  }

  _renderImagePreview() {
    const wrap = this.shadowRoot.getElementById("imgprev-wrap");
    if (!wrap) return;
    const img = this._editing.img;
    wrap.innerHTML = img
      ? `<img class="imgprev" src="/assets/${DOMAIN}/${img}" alt="">`
      : "";
  }

  _toast(message) {
    const t = this.shadowRoot.getElementById("toast");
    if (!t) return;
    t.textContent = message;
    t.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }
}

customElements.define("benni-scene-presets-panel", BenniScenePresetsPanel);
