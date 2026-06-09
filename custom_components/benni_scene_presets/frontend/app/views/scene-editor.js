// Screens 07 + 08 — RGB Scene Editor and Kelvin Scene Editor.
// One module, driven by editing.mode ("rgb" | "kelvin"). Scenes are
// device-agnostic and store no targets; the editor saves scene data only.
// A modern slider-based picker (HSL / Kelvin) avoids the native colour dialog.

import { DOMAIN, esc, slugify, kelvinToHex, MAX_STOPS } from "../store.js";

// ---- colour helpers ----
function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  let r = 255, g = 136, b = 0;
  if (m) { const n = parseInt(m[1], 16); r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255; }
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x) => Math.round(255 * x).toString(16).padStart(2, "0");
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

const blankScene = (mode) => ({
  slug: null, mode, name: "", category: "", img: null, description: "",
  colors: ["#ff8800"], kelvins: [3000], interval: 300, transition: 60, shuffle: true, active: 0,
});

export function newScene(ctx, mode) { ctx.ui.editing = blankScene(mode === "kelvin" ? "kelvin" : "rgb"); ctx.ui.selected = null; }
export function editFrom(ctx, p) {
  const isK = ctx.store.isKelvinScene(p);
  ctx.ui.editing = {
    slug: p.slug, mode: isK ? "kelvin" : "rgb", name: p.name || "", category: p.category || "",
    img: p.img || null, description: p.description || "",
    colors: (p.lights || []).map((l) => l.hex || "#ffffff"),
    kelvins: isK ? ctx.store.presetKelvins(p).slice() : [3000],
    interval: p.interval != null ? p.interval : 300,
    transition: p.transition != null ? p.transition : 60,
    shuffle: p.shuffle != null ? p.shuffle : true, active: 0,
  };
  if (!ctx.ui.editing.colors.length) ctx.ui.editing.colors = ["#ff8800"];
}

function gradientCss(s) {
  const cs = s.mode === "kelvin" ? s.kelvins.map(kelvinToHex) : s.colors;
  if (cs.length > 1) return `linear-gradient(135deg,${cs.join(",")})`;
  if (cs.length === 1) return `linear-gradient(135deg,${cs[0]},#00000055)`;
  return "#333";
}

function stopRows(s) {
  if (s.mode === "kelvin") {
    return s.kelvins.map((k, i) => `
      <div class="stop ${i === s.active ? "active" : ""}" data-stop-sel="${i}">
        <span class="idx">${i + 1}</span>
        <i class="sw" style="background:${kelvinToHex(k)}"></i>
        <input type="range" min="1800" max="10000" step="50" value="${k}" data-stop-k="${i}">
        <code data-klabel="${i}">${k} K</code>
        <span class="iconbtn" data-stop-up="${i}" title="Up">↑</span>
        <span class="iconbtn" data-stop-down="${i}" title="Down">↓</span>
        <span class="iconbtn" data-stop-del="${i}" title="Remove">✕</span>
      </div>`).join("");
  }
  return s.colors.map((hex, i) => `
    <div class="stop ${i === s.active ? "active" : ""}" data-stop-sel="${i}">
      <span class="idx">${i + 1}</span>
      <i class="sw" style="background:${hex}"></i>
      <code data-clabel="${i}">${esc(hex)}</code>
      <span class="iconbtn" data-stop-up="${i}" title="Up">↑</span>
      <span class="iconbtn" data-stop-down="${i}" title="Down">↓</span>
      <span class="iconbtn" data-stop-del="${i}" title="Remove">✕</span>
    </div>`).join("");
}

function picker(s) {
  if (s.mode === "kelvin") {
    const k = s.kelvins[s.active] || 3000;
    return `
    <div class="picker">
      <div class="h">Selected Stop</div>
      <i class="sw big" id="se-activeswatch" style="background:${kelvinToHex(k)}"></i>
      <div class="krow"><input type="range" min="1800" max="10000" step="50" value="${k}" data-kelvin><code id="se-hex">${k} K</code></div>
      <div class="hint">Valid range ~1800–10000 K (clamped to your lights' range).</div>
    </div>`;
  }
  const hex = s.colors[s.active] || "#ff8800";
  const { h, l, s: sat } = hexToHsl(hex);
  return `
  <div class="picker">
    <div class="h">Selected Stop</div>
    <i class="sw big" id="se-activeswatch" style="background:${hex}"></i>
    <label class="slabel">Hue</label><input type="range" min="0" max="360" value="${h}" data-hsl="h" class="hue">
    <label class="slabel">Saturation</label><input type="range" min="0" max="100" value="${sat}" data-hsl="s">
    <label class="slabel">Lightness</label><input type="range" min="0" max="100" value="${l}" data-hsl="l">
    <div class="krow"><input type="text" value="${esc(hex)}" data-hex id="se-hex" style="width:110px"><input type="color" value="${hex}" data-native></div>
  </div>`;
}

export function render(ctx) {
  const s = ctx.ui.editing;
  if (!s) return `<div class="placeholder"><div class="big">No scene loaded</div></div>`;
  const isK = s.mode === "kelvin";
  const stopLabel = isK ? "Kelvin Stops" : "Color Stops";
  const count = isK ? s.kelvins.length : s.colors.length;
  const categoryOptions = ctx.store.categoryOptions(s.category);
  const categorySelect = `<select data-sef="category"><option value="">Uncategorized</option>${categoryOptions.map((c) => `<option value="${esc(c)}" ${s.category === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>`;
  return `
  <div class="page-head">
    <div><h1>${s.slug ? "Edit" : "Create"} ${isK ? "Kelvin" : "RGB"} Scene</h1><div class="sub">Define colours, order and timing for this scene.</div></div>
    <div class="spacer"></div>
    <div class="btn" data-se="cancel">Cancel</div>
    <div class="btn" data-se="preview">▶ Preview on test targets</div>
    <div class="btn primary" data-se="save">Save Scene</div>
  </div>

  <div class="editor-grid">
    <div class="form-card">
      <div class="frow"><label>Image</label><input type="file" accept="image/*" data-img>${s.img ? `<img class="imgprev" src="/assets/${DOMAIN}/${esc(s.img)}">` : ""}</div>
      <div class="frow"><label>Name</label><input data-sef="name" value="${esc(s.name)}" placeholder="Scene name"></div>
      <div class="frow"><label>Slug</label><code class="slugpv">${esc(s.slug || slugify(s.name))}</code></div>
      <div class="frow"><label>Category</label>${categorySelect}</div>
      <div class="frow"><label>Description</label><input data-sef="description" value="${esc(s.description)}" placeholder="optional"></div>
      <div class="frow"><label>Interval (s)</label><input type="number" min="0" max="3600" data-sef="interval" value="${esc(s.interval)}" style="width:100px">
        <label style="margin-left:14px">Transition (s)</label><input type="number" min="0" max="300" data-sef="transition" value="${esc(s.transition)}" style="width:100px"></div>
      ${isK ? "" : `<div class="frow"><label>Shuffle</label><input type="checkbox" data-shuffle ${s.shuffle ? "checked" : ""}></div>`}
      <div class="hint">${isK ? "This Kelvin scene is device-agnostic." : "This scene is device-agnostic."} Actual rendering depends on the target lights and their capabilities.</div>
    </div>

    <div class="form-card">
      <div class="h">${stopLabel} <span class="hint">(${count}/${MAX_STOPS})</span></div>
      <div class="stops">${stopRows(s)}</div>
      <div class="btn sm" data-se="add-stop" style="margin-top:8px">＋ Add ${isK ? "Kelvin" : "Color"} Stop</div>
      ${picker(s)}
    </div>

    <div class="form-card">
      <div class="h">Live Preview</div>
      <div class="preview-box" id="se-gradient" style="background:${gradientCss(s)}"></div>
      <div class="section"><div class="h">Scene Info</div>
        <div class="bind-row"><span>Stops</span><span class="t">${count}</span></div>
        <div class="bind-row"><span>Interval</span><span class="t">${s.interval}s</span></div>
        <div class="bind-row"><span>Transition</span><span class="t">${s.transition}s</span></div>
      </div>
      <div class="check"><span class="mk">✓</span>${isK ? "Kelvin" : "Colour"} sequence valid</div>
      <div class="btn primary" data-se="preview" style="width:100%;justify-content:center;margin-top:10px">▶ Preview on test targets</div>
    </div>
  </div>`;
}

// ---- events ----
export function onClick(ctx, e) {
  const s = ctx.ui.editing; if (!s) return;
  const t = (sel) => e.target.closest(sel);
  let el;
  if ((el = t("[data-se]"))) {
    const cmd = el.dataset.se;
    if (cmd === "cancel") { ctx.ui.editing = null; ctx.navigate(s.mode === "kelvin" ? "kelvin" : "rgb"); return; }
    if (cmd === "save") { save(ctx); return; }
    if (cmd === "preview") { preview(ctx); return; }
    if (cmd === "add-stop") {
      if (s.mode === "kelvin") { if (s.kelvins.length < MAX_STOPS) { s.kelvins.push(3000); s.active = s.kelvins.length - 1; } }
      else if (s.colors.length < MAX_STOPS) { s.colors.push("#ffffff"); s.active = s.colors.length - 1; }
      ctx.renderMain(); return;
    }
  }
  if ((el = t("[data-stop-del]"))) { e.stopPropagation(); delStop(ctx, Number(el.dataset.stopDel)); return; }
  if ((el = t("[data-stop-up]"))) { e.stopPropagation(); move(ctx, Number(el.dataset.stopUp), -1); return; }
  if ((el = t("[data-stop-down]"))) { e.stopPropagation(); move(ctx, Number(el.dataset.stopDown), 1); return; }
  if ((el = t("[data-stop-sel]"))) { s.active = Number(el.dataset.stopSel); ctx.renderMain(); return; }
}

export function onInput(ctx, e) {
  const s = ctx.ui.editing; if (!s) return;
  const root = e.target.getRootNode();
  let el;
  if ((el = e.target.closest("[data-sef]"))) {
    s[el.dataset.sef] = el.value;
    if (el.dataset.sef === "name") { const pv = root.querySelector(".slugpv"); if (pv && !s.slug) pv.textContent = slugify(el.value); }
    return;
  }
  if ((el = e.target.closest("[data-stop-k]"))) { // per-row kelvin slider
    const i = Number(el.dataset.stopK); s.kelvins[i] = Number(el.value);
    const lab = root.querySelector(`[data-klabel="${i}"]`); if (lab) lab.textContent = `${el.value} K`;
    el.previousElementSibling && (el.previousElementSibling.style.background = kelvinToHex(Number(el.value)));
    if (i === s.active) { const sw = root.querySelector("#se-activeswatch"); if (sw) sw.style.background = kelvinToHex(Number(el.value)); const hx = root.querySelector("#se-hex"); if (hx) hx.textContent = `${el.value} K`; }
    refreshGradient(root, s); return;
  }
  if ((el = e.target.closest("[data-kelvin]"))) { // active kelvin slider
    s.kelvins[s.active] = Number(el.value);
    setSwatch(root, kelvinToHex(Number(el.value))); const hx = root.querySelector("#se-hex"); if (hx) hx.textContent = `${el.value} K`;
    syncRow(root, s.active, kelvinToHex(Number(el.value)), `${el.value} K`, "klabel");
    refreshGradient(root, s); return;
  }
  if ((el = e.target.closest("[data-hsl]"))) {
    const get = (k) => Number(root.querySelector(`[data-hsl="${k}"]`).value);
    const hex = hslToHex(get("h"), get("s"), get("l"));
    s.colors[s.active] = hex; applyHex(root, s, hex); return;
  }
  if ((el = e.target.closest("[data-hex]"))) {
    let v = el.value.trim(); if (!v.startsWith("#")) v = "#" + v;
    if (/^#[0-9a-f]{6}$/i.test(v)) { s.colors[s.active] = v; applyHex(root, s, v, true); }
    return;
  }
}

export function onChange(ctx, e) {
  const s = ctx.ui.editing; if (!s) return;
  let el;
  if ((el = e.target.closest("[data-sef]"))) { s[el.dataset.sef] = el.value; return; }
  if ((el = e.target.closest("[data-shuffle]"))) { s.shuffle = el.checked; return; }
  if ((el = e.target.closest("[data-native]"))) { s.colors[s.active] = el.value; applyHex(e.target.getRootNode(), s, el.value, true); return; }
  if ((el = e.target.closest("[data-img]"))) { if (el.files && el.files[0]) upload(ctx, el.files[0]); return; }
}

// ---- live DOM helpers (avoid full re-render while dragging sliders) ----
function setSwatch(root, color) { const sw = root.querySelector("#se-activeswatch"); if (sw) sw.style.background = color; }
function refreshGradient(root, s) { const g = root.querySelector("#se-gradient"); if (g) g.style.background = gradientCss(s); }
function syncRow(root, i, color, label, labelAttr) {
  const sw = root.querySelector(`[data-stop-sel="${i}"] .sw`); if (sw) sw.style.background = color;
  const lab = root.querySelector(`[data-${labelAttr}="${i}"]`); if (lab) lab.textContent = label;
}
function applyHex(root, s, hex, syncSliders) {
  setSwatch(root, hex);
  const hx = root.querySelector("#se-hex"); if (hx && hx.tagName === "INPUT") hx.value = hex; else if (hx) hx.textContent = hex;
  syncRow(root, s.active, hex, hex, "clabel");
  refreshGradient(root, s);
  if (syncSliders) { const { h, s: sat, l } = hexToHsl(hex); const set = (k, v) => { const e = root.querySelector(`[data-hsl="${k}"]`); if (e) e.value = v; }; set("h", h); set("s", sat); set("l", l); const nat = root.querySelector("[data-native]"); if (nat) nat.value = hex; }
}

function move(ctx, i, dir) {
  const s = ctx.ui.editing;
  const arr = s.mode === "kelvin" ? s.kelvins : s.colors;
  const j = i + dir; if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  if (s.active === i) s.active = j; else if (s.active === j) s.active = i;
  ctx.renderMain();
}
function delStop(ctx, i) {
  const s = ctx.ui.editing;
  const arr = s.mode === "kelvin" ? s.kelvins : s.colors;
  arr.splice(i, 1);
  if (!arr.length) arr.push(s.mode === "kelvin" ? 3000 : "#ffffff");
  s.active = Math.min(s.active, arr.length - 1);
  ctx.renderMain();
}

async function upload(ctx, file) {
  try { ctx.ui.editing.img = await ctx.store.uploadImage(file); ctx.toast("Image uploaded."); ctx.renderMain(); }
  catch (err) { ctx.toast(`Upload failed: ${err.message || err}`); }
}

async function preview(ctx) {
  const s = ctx.ui.editing;
  const entity_id = ctx.store.expandList(ctx.ui.testTargets || []);
  if (!entity_id.length) {
    ctx.toast("Pick test targets first (⚙ Test targets in a library).");
    return;
  }
  try {
    if (s.mode === "kelvin") await ctx.store.applyPreview({ entity_id, kelvin: s.kelvins[0] });
    else await ctx.store.applyPreview({ entity_id, colors: s.colors });
    ctx.toast("Previewing.");
  } catch (err) { ctx.toast(`Preview failed: ${err.message || err}`); }
}

async function save(ctx) {
  const s = ctx.ui.editing;
  if (!s.name.trim()) { ctx.toast("Enter a name."); return; }
  const payload = {
    name: s.name.trim(), category: s.category || null,
    interval: Number(s.interval), transition: Number(s.transition), shuffle: !!s.shuffle,
  };
  if (s.mode === "kelvin") {
    const ks = s.kelvins.map(Number).filter((k) => !Number.isNaN(k));
    if (!ks.length) { ctx.toast("Add at least one Kelvin stop."); return; }
    payload.kelvins = ks;
  } else {
    if (!s.colors.length) { ctx.toast("Add at least one colour."); return; }
    payload.colors = s.colors;
  }
  if (s.slug) payload.slug = s.slug;
  if (s.img) payload.img = s.img;
  try { await ctx.store.savePreset(payload); ctx.toast("Scene saved."); ctx.ui.editing = null; await ctx.refresh(); ctx.navigate(s.mode === "kelvin" ? "kelvin" : "rgb"); }
  catch (err) { ctx.toast(`Save failed: ${err.message || err}`); }
}
