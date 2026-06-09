// Screen 09 — Import / Export.
// JSON is the primary, versioned, type-aware format. Legacy BSP1 strings remain
// readable. Import always validates → previews → imports (never silently).

import { esc, slugify } from "../store.js";

const EXPORT_FORMAT = "benni_scene_presets";
const VERSION = "1.0.0";
const TYPES = [
  ["look", "Look"], ["rgb_scene", "RGB Scene"], ["kelvin_scene", "Kelvin Scene"], ["aqara_ring_effect", "Aqara Ring Effect"],
];

export function init(ctx) {
  if (ctx.ui.io) return;
  ctx.ui.io = {
    tab: "export", exportType: "single", itemType: "look", slug: "",
    format: "json", pretty: true, metadata: true,
    output: "", importText: "", summary: null, merge: "ask",
  };
}

function itemsOf(ctx, type) {
  const s = ctx.store;
  if (type === "look") return s.looks;
  if (type === "rgb_scene") return s.rgbScenes();
  if (type === "kelvin_scene") return s.kelvinScenes();
  if (type === "aqara_ring_effect") return s.aqara;
  return [];
}

function wrap(type, data, meta) {
  const w = { export_format: EXPORT_FORMAT, version: VERSION, type, data };
  if (meta) w.exported_at = new Date().toISOString();
  return w;
}

function buildExport(ctx) {
  const io = ctx.ui.io;
  const meta = io.metadata;
  let payload;
  if (io.exportType === "library") {
    const items = [];
    for (const [type] of TYPES) for (const obj of itemsOf(ctx, type)) items.push({ type, data: obj });
    payload = { export_format: EXPORT_FORMAT, version: VERSION, type: "library_bundle", items };
    if (meta) payload.exported_at = new Date().toISOString();
  } else if (io.exportType === "multiple") {
    const items = itemsOf(ctx, io.itemType).map((obj) => ({ type: io.itemType, data: obj }));
    payload = { export_format: EXPORT_FORMAT, version: VERSION, type: "library_bundle", items };
    if (meta) payload.exported_at = new Date().toISOString();
  } else {
    const obj = itemsOf(ctx, io.itemType).find((x) => x.slug === io.slug) || itemsOf(ctx, io.itemType)[0];
    if (!obj) return "// Nothing to export.";
    payload = wrap(io.itemType, obj, meta);
  }
  if (io.format === "bsp1") return toBsp1(payload);
  return JSON.stringify(payload, null, io.pretty ? 2 : 0);
}

// --- legacy BSP1 (compact base64) for single scenes ---
function toBsp1(payload) {
  const d = payload.data || {};
  const compact = { n: d.name, cat: d.category || "", i: d.interval, t: d.transition, s: d.shuffle };
  if (d.kelvins) compact.k = d.kelvins;
  else compact.c = (d.lights || []).map((l) => l.hex);
  return "BSP1:" + btoa(unescape(encodeURIComponent(JSON.stringify(compact))));
}
function fromBsp1(str) {
  const p = JSON.parse(decodeURIComponent(escape(atob(str.slice(5)))));
  const type = p.k ? "kelvin_scene" : "rgb_scene";
  const data = { name: p.n, category: p.cat || "", interval: p.i, transition: p.t, shuffle: p.s };
  if (p.k) data.kelvins = Array.isArray(p.k) ? p.k : [p.k];
  else data.lights = (p.c || []).map((hex) => ({ hex }));
  return [{ type, data }];
}

// --- import parsing + validation ---
function parseImport(ctx, text) {
  text = (text || "").trim();
  if (!text) throw new Error("Nothing to import.");
  if (text.startsWith("BSP1:")) return fromBsp1(text);
  const json = JSON.parse(text);
  if (json.type === "library_bundle") return (json.items || []);
  if (json.export_format === EXPORT_FORMAT && json.type && json.data) return [{ type: json.type, data: json.data }];
  throw new Error("Unrecognised format (expected benni_scene_presets JSON or BSP1).");
}

function existsSlug(ctx, type, data) {
  const slug = data.slug || slugify(data.name || "");
  return itemsOf(ctx, type).some((x) => x.slug === slug);
}

function validate(ctx, items) {
  let neu = 0, update = 0, errors = 0;
  const detail = [];
  for (const it of items) {
    const known = TYPES.some(([t]) => t === it.type);
    if (!known || !it.data || !it.data.name) { errors++; detail.push({ ...it, status: "error", reason: !known ? "unknown type" : "missing data/name" }); continue; }
    const upd = existsSlug(ctx, it.type, it.data);
    if (upd) update++; else neu++;
    detail.push({ ...it, status: upd ? "update" : "new" });
  }
  return { count: items.length, neu, update, errors, detail };
}

async function importItem(ctx, it) {
  const d = it.data;
  if (it.type === "look") {
    const payload = { name: d.name, bindings: d.bindings || [] };
    if (d.slug) payload.slug = d.slug; if (d.category) payload.category = d.category; if (d.img) payload.img = d.img; if (d.transition != null) payload.transition = d.transition;
    return ctx.store.saveLook(payload);
  }
  if (it.type === "aqara_ring_effect") {
    const payload = { name: d.name, service: d.service, data: d.data || {} };
    if (d.slug) payload.slug = d.slug; if (d.category) payload.category = d.category; if (d.img) payload.img = d.img;
    return ctx.store.saveAqara(payload);
  }
  // rgb_scene / kelvin_scene
  const payload = { name: d.name, category: d.category || null, interval: d.interval != null ? d.interval : 300, transition: d.transition != null ? d.transition : 60, shuffle: d.shuffle != null ? d.shuffle : true };
  if (it.type === "kelvin_scene") payload.kelvins = d.kelvins || (d.kelvin != null ? [d.kelvin] : []);
  else payload.colors = (d.color_stops ? d.color_stops.map((c) => c.hex) : (d.lights || []).map((l) => l.hex)) || [];
  if (d.slug) payload.slug = d.slug; if (d.img) payload.img = d.img;
  return ctx.store.savePreset(payload);
}

// ---- render ----
export function render(ctx) {
  init(ctx);
  const io = ctx.ui.io;
  const tabBtn = (k, l) => `<span class="chip ${io.tab === k ? "active" : ""}" data-iotab="${k}">${l}</span>`;
  return `
  <div class="page-head"><div><h1>Import / Export</h1><div class="sub">Versioned, type-aware JSON. Legacy BSP1 strings stay readable.</div></div></div>
  <div class="tabs">${tabBtn("export", "Export")}${tabBtn("import", "Import")}</div>
  ${io.tab === "export" ? exportView(ctx, io) : importView(ctx, io)}`;
}

function exportView(ctx, io) {
  const sel = (val, opts, attr) => `<select data-io="${attr}">${opts.map(([v, l]) => `<option value="${v}" ${val === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const items = itemsOf(ctx, io.itemType);
  return `
  <div class="form-card">
    <div class="frow"><label>Export type</label>${sel(io.exportType, [["single", "Single item"], ["multiple", "Multiple (one type)"], ["library", "Entire library"]], "exportType")}</div>
    ${io.exportType !== "library" ? `<div class="frow"><label>Item type</label>${sel(io.itemType, TYPES, "itemType")}</div>` : ""}
    ${io.exportType === "single" ? `<div class="frow"><label>Item</label><select data-io="slug"><option value="">${items.length ? "(first)" : "(none)"}</option>${items.map((x) => `<option value="${esc(x.slug)}" ${io.slug === x.slug ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></div>` : ""}
    <div class="frow"><label>Format</label>${sel(io.format, [["json", "JSON (recommended)"], ["bsp1", "Legacy BSP1"]], "format")}
      <label style="margin-left:14px">Pretty</label><input type="checkbox" data-io-chk="pretty" ${io.pretty ? "checked" : ""}>
      <label style="margin-left:14px">Metadata</label><input type="checkbox" data-io-chk="metadata" ${io.metadata ? "checked" : ""}></div>
    <div class="qa"><div class="btn primary" data-io-act="build">Export</div><div class="btn" data-io-act="copy">⧉ Copy</div><div class="btn" data-io-act="download">⬇ Download</div></div>
  </div>
  <div class="form-card"><div class="h">Preview</div><pre class="code big" id="io-out">${esc(io.output || "// Click Export to generate.")}</pre>
  <div class="hint">Images are not included in this export.</div></div>`;
}

function importView(ctx, io) {
  const s = io.summary;
  return `
  <div class="editor-grid" style="grid-template-columns:1fr 1fr">
    <div class="form-card">
      <div class="h">Source</div>
      <div class="frow"><label>From file</label><input type="file" accept=".json,.txt" data-io-file></div>
      <textarea data-io="importText" rows="10" placeholder="Paste JSON or BSP1 string…" style="width:100%">${esc(io.importText)}</textarea>
    </div>
    <div class="form-card">
      <div class="h">Options</div>
      <div class="frow"><label>Merge</label><select data-io="merge">${[["ask", "Replace existing"], ["skip", "Skip existing"]].map(([v, l]) => `<option value="${v}" ${io.merge === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="qa"><div class="btn" data-io-act="validate">Validate</div><div class="btn primary ${s && s.count && !s.errors ? "" : "disabled"}" data-io-act="import">Import</div></div>
      ${s ? `<div class="section">
        <div class="bind-row"><span>Items found</span><span class="t">${s.count}</span></div>
        <div class="bind-row"><span>New</span><span class="t">${s.neu}</span></div>
        <div class="bind-row"><span>To update</span><span class="t">${s.update}</span></div>
        <div class="bind-row"><span>Errors</span><span class="t" style="color:${s.errors ? "var(--red)" : "var(--muted)"}">${s.errors}</span></div>
        ${s.detail.map((d) => `<div class="check ${d.status === "error" ? "bad" : ""}"><span class="mk">${d.status === "error" ? "✕" : "✓"}</span>${esc((d.data && d.data.name) || "?")} — ${d.status}${d.reason ? " (" + esc(d.reason) + ")" : ""}</div>`).join("")}
      </div>` : `<div class="hint">Validate before importing — nothing is written until you confirm.</div>`}
    </div>
  </div>`;
}

// ---- events ----
export function onClick(ctx, e) {
  const io = ctx.ui.io;
  const t = (sel) => e.target.closest(sel);
  let el;
  if ((el = t("[data-iotab]"))) { io.tab = el.dataset.iotab; ctx.renderMain(); return; }
  if ((el = t("[data-io-act]"))) {
    const a = el.dataset.ioAct;
    if (a === "build") { io.output = buildExport(ctx); ctx.renderMain(); }
    else if (a === "copy") { io.output = io.output || buildExport(ctx); ctx.copy(io.output); }
    else if (a === "download") { io.output = io.output || buildExport(ctx); download(io); }
    else if (a === "validate") { doValidate(ctx); }
    else if (a === "import") { doImport(ctx); }
    return;
  }
}
export function onInput(ctx, e) {
  const io = ctx.ui.io;
  const el = e.target.closest("[data-io]"); if (!el) return;
  io[el.dataset.io] = el.value;
}
export function onChange(ctx, e) {
  const io = ctx.ui.io;
  let el;
  if ((el = e.target.closest("[data-io]"))) { io[el.dataset.io] = el.value; ctx.renderMain(); return; }
  if ((el = e.target.closest("[data-io-chk]"))) { io[el.dataset.ioChk] = el.checked; return; }
  if ((el = e.target.closest("[data-io-file]"))) {
    const f = el.files && el.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => { io.importText = String(r.result || ""); io.summary = null; ctx.renderMain(); }; r.readAsText(f);
  }
}

function doValidate(ctx) {
  const io = ctx.ui.io;
  try { io.summary = validate(ctx, parseImport(ctx, io.importText)); ctx.toast(`${io.summary.count} item(s) found.`); }
  catch (err) { io.summary = null; ctx.toast(`Validation failed: ${err.message || err}`); }
  ctx.renderMain();
}
async function doImport(ctx) {
  const io = ctx.ui.io;
  let items;
  try { items = parseImport(ctx, io.importText); } catch (err) { ctx.toast(`Parse failed: ${err.message || err}`); return; }
  const v = validate(ctx, items);
  let done = 0, skipped = 0;
  for (const d of v.detail) {
    if (d.status === "error") continue;
    if (io.merge === "skip" && d.status === "update") { skipped++; continue; }
    try { await importItem(ctx, d); done++; } catch (err) { ctx.toast(`Import error: ${err.message || err}`); }
  }
  ctx.toast(`Imported ${done}${skipped ? `, skipped ${skipped}` : ""}.`);
  io.summary = null; io.importText = "";
  await ctx.refresh();
  ctx.navigate("io");
}

function download(io) {
  const ext = io.format === "bsp1" ? "txt" : "json";
  const blob = new Blob([io.output], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `benni_scene_presets_export.${ext}`; a.click();
  URL.revokeObjectURL(a.href);
}
