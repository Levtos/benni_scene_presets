// Screen 04 — Aqara Ring Effects Library.
// References to Aqara Advanced Lighting (AAL) actions. The integration does not
// render RGBIC effects itself; it stores references that Looks can bind to.
// No persistent targets here — only an optional Preview on test targets.

import { AQARA_DOMAIN, esc } from "../store.js";

const SERVICES = [
  { v: "start_dynamic_scene", l: "Dynamic Scene" },
  { v: "set_dynamic_effect", l: "Dynamic Effect" },
];

const blank = () => ({ slug: null, name: "", img: null, service: "start_dynamic_scene", preset: "", brightness: "" });

function card(ctx, a) {
  const { favs, ui } = ctx;
  const sel = ui.selected === a.slug ? " selected" : "";
  const preset = a.data && a.data.preset;
  return `
  <div class="card${sel}" data-aqara="${esc(a.slug)}">
    <div class="thumb" style="background:linear-gradient(135deg,#3a2a55,#1f2b3a);display:grid;place-items:center">
      ${a.img ? `<img src="/assets/${ "benni_scene_presets" }/${esc(a.img)}">` : `<div style="font-size:30px;color:var(--purple)">◎</div>`}
      <span class="badge">AAL reference</span>
      <span class="fav ${favs.has(a.slug) ? "on" : ""}" data-fav="${esc(a.slug)}">${favs.has(a.slug) ? "★" : "☆"}</span>
    </div>
    <div class="body">
      <div class="name">${esc(a.name)}</div>
      <div class="meta"><span>${esc(a.service || "")}</span></div>
      <div class="meta"><span>${esc(preset || "—")}</span></div>
      <div class="acts">
        <div class="iconbtn play" data-preview="${esc(a.slug)}" title="Preview on test targets">▶</div>
        <div class="iconbtn" data-edit="${esc(a.slug)}" title="Edit">✎</div>
        <div class="iconbtn" data-del="${esc(a.slug)}" title="Delete">🗑</div>
      </div>
    </div>
  </div>`;
}

function detail(ctx) {
  const { store, ui } = ctx;
  const a = store.aqara.find((x) => x.slug === ui.selected) || store.aqara[0];
  if (!a) return `<div class="detail"><div class="empty">No ring effects yet.</div></div>`;
  const data = a.data || {};
  const dataStr = JSON.stringify(data, null, 2);
  const usedIn = store.looksUsingAqara(a.slug);
  return `
  <div class="detail">
    <h3>${esc(a.name)}</h3>
    <div class="slug">Aqara Ring Effect Reference</div>
    <div class="section"><div class="h">Service / Action</div>
      <div class="bind-row"><code>${esc(a.service)}</code><span class="iconbtn" data-copy="${esc(a.service)}" style="width:24px;height:24px;font-size:11px;margin-left:auto">⧉</span></div>
    </div>
    <div class="section"><div class="h">Service Data</div>
      <pre class="code">${esc(dataStr)}</pre>
      <span class="btn sm" data-copy="${esc(dataStr)}">⧉ Copy data</span>
    </div>
    ${usedIn.length ? `<div class="section"><div class="h">Used in Looks</div>${usedIn.map((l) => `<div class="bind-row"><span>${esc(l.name)}</span></div>`).join("")}</div>` : ""}
    <div class="section"><div class="h">Notes</div>
      <div class="sub">Executed through Aqara Advanced Lighting (AAL). Behaviour may vary between devices and firmware versions.</div>
    </div>
    <div class="cta">
      <div class="btn primary" data-preview="${esc(a.slug)}">▶ Preview</div>
      <div class="btn" data-edit="${esc(a.slug)}">Edit</div>
    </div>
  </div>`;
}

export function render(ctx) {
  const { store, ui } = ctx;
  const q = (ui.search || "").trim().toLowerCase();
  const list = store.aqara.filter((a) => {
    if (ui.filter === "fav" && !ctx.favs.has(a.slug)) return false;
    return !q || `${a.name} ${a.slug} ${a.service}`.toLowerCase().includes(q);
  });
  const testN = (ui.testTargets || []).length;
  const editing = ui.editingAqara;

  if (editing) return editor(ctx, editing);

  const tabs = [["all", "All"], ["fav", "Favorites"]].map(([k, l]) => `<span class="chip ${ui.filter === k ? "active" : ""}" data-filter="${k}">${l}</span>`).join("");
  const grid = store.aqara.length
    ? `<div class="grid">${list.map((a) => card(ctx, a)).join("")}
        <div class="card" data-new="aqara" style="border-style:dashed;align-items:center;justify-content:center;min-height:180px">
          <div class="body" style="align-items:center;color:var(--muted)"><div style="font-size:26px">＋</div><div>New Ring Effect</div></div>
        </div></div>`
    : `<div class="empty">No ring effects yet. <span class="btn sm primary" data-new="aqara" style="margin-left:8px">＋ New Ring Effect</span></div>`;

  return `
  <div class="page-head">
    <div><h1>Aqara Ring Effects</h1><div class="sub">References to Aqara Advanced Lighting actions.</div></div>
    <div class="spacer"></div>
    <div class="search"><span class="ic">⌕</span><input data-input="search" placeholder="Search ring effects…" value="${esc(ui.search || "")}"></div>
    <div class="btn" data-act="test-targets">⚙ Test targets (${testN})</div>
    <div class="btn primary" data-new="aqara">＋ New Ring Effect</div>
  </div>
  <div class="tabs">${tabs}</div>
  <div class="split"><div>${grid}</div>${detail(ctx)}</div>`;
}

function editor(ctx, a) {
  const { store } = ctx;
  const opts = store.aqaraPresetOptions(a.service);
  const inList = opts.some((o) => o.value === a.preset);
  const noAal = opts.length === 0;
  return `
  <div class="page-head">
    <div><h1>${a.slug ? "Edit" : "New"} Ring Effect</h1><div class="sub">A reference to an Aqara Advanced Lighting action.</div></div>
    <div class="spacer"></div>
    <div class="btn" data-aq="cancel">Cancel</div>
    <div class="btn primary" data-aq="save">Save</div>
  </div>
  <div class="form-card">
    <div class="frow"><label>Name</label><input data-aqf="name" value="${esc(a.name)}" placeholder="Display name"></div>
    <div class="frow"><label>Type</label><select data-aqf="service">${SERVICES.map((s) => `<option value="${s.v}" ${a.service === s.v ? "selected" : ""}>${s.l}</option>`).join("")}</select></div>
    <div class="frow"><label>Aqara preset</label>${noAal
      ? `<input data-aqf="preset" value="${esc(a.preset)}" placeholder="preset name (AAL not detected)">`
      : `<select data-aqf="preset"><option value="">– pick –</option>${opts.map((o) => `<option value="${esc(o.value)}" ${a.preset === o.value ? "selected" : ""}>${esc(o.label)}</option>`).join("")}${a.preset && !inList ? `<option value="${esc(a.preset)}" selected>${esc(a.preset)} (custom)</option>` : ""}</select>`}</div>
    <div class="frow"><label>Brightness %</label><input type="number" min="1" max="100" data-aqf="brightness" value="${esc(a.brightness)}" placeholder="optional" style="width:120px"></div>
    <div class="hint">The preset list is read live from Aqara Advanced Lighting.</div>
  </div>`;
}

export function onClick(ctx, e) {
  const { store, ui } = ctx;
  const t = (sel) => e.target.closest(sel);
  let el;
  // editor mode
  if (ui.editingAqara) {
    if ((el = t('[data-aq="cancel"]'))) { ui.editingAqara = null; ctx.render(); return; }
    if ((el = t('[data-aq="save"]'))) { save(ctx); return; }
    return;
  }
  if ((el = t("[data-filter]"))) { ui.filter = el.dataset.filter; ctx.renderMain(); return; }
  if ((el = t("[data-preview]"))) { e.stopPropagation(); preview(ctx, el.dataset.preview); return; }
  if ((el = t("[data-edit]"))) { e.stopPropagation(); const a = store.findAqara(el.dataset.edit); if (a) { ui.editingAqara = { slug: a.slug, name: a.name || "", img: a.img || null, service: a.service || "start_dynamic_scene", preset: (a.data && a.data.preset) || "", brightness: (a.data && a.data.brightness) != null ? a.data.brightness : "" }; ctx.render(); } return; }
  if ((el = t("[data-del]"))) { e.stopPropagation(); del(ctx, el.dataset.del); return; }
  if ((el = t("[data-new]"))) { e.stopPropagation(); ui.editingAqara = blank(); ctx.render(); return; }
  if ((el = t('[data-act="test-targets"]'))) { openTestTargets(ctx); return; }
  if ((el = t("[data-aqara]"))) { ui.selected = el.dataset.aqara; ctx.renderMain(); return; }
}

export function onInput(ctx, e) {
  const a = ctx.ui.editingAqara; if (!a) return;
  const el = e.target.closest("[data-aqf]"); if (!el) return;
  a[el.dataset.aqf] = el.value;
}
export function onChange(ctx, e) {
  const a = ctx.ui.editingAqara; if (!a) return;
  const el = e.target.closest("[data-aqf]"); if (!el) return;
  a[el.dataset.aqf] = el.value;
  if (el.dataset.aqf === "service") ctx.render(); // refresh preset options
}

function openTestTargets(ctx) {
  ctx.openDrawer({
    title: "Test Targets", subtitle: "Lights used for Preview only.",
    mode: "all", selected: ctx.ui.testTargets || [],
    apply: (ids) => { ctx.saveTestTargets(ids); ctx.toast(`${ids.length} test target(s) set.`); ctx.renderMain(); },
  });
}

async function preview(ctx, slug) {
  const { store } = ctx;
  const a = store.findAqara(slug);
  if (!a || !a.service) return;
  const entity_id = store.expandList(ctx.ui.testTargets || []);
  if (!entity_id.length) { ctx.toast("Pick test targets first (⚙ Test targets)."); openTestTargets(ctx); return; }
  try {
    const data = { ...(a.data || {}), entity_id };
    if (a.service === "set_dynamic_effect" && data.turn_on === undefined) data.turn_on = true;
    await ctx.hass.callService(AQARA_DOMAIN, a.service, data);
    ctx.toast(`Previewing "${a.name}".`);
  } catch (err) { ctx.toast(`Preview failed: ${err.message || err}`); }
}

async function save(ctx) {
  const a = ctx.ui.editingAqara;
  if (!a.name.trim()) { ctx.toast("Name the ring effect."); return; }
  if (!String(a.preset).trim()) { ctx.toast("Pick the Aqara preset."); return; }
  const data = { preset: String(a.preset).trim() };
  if (a.brightness !== "" && a.brightness != null) data.brightness = Number(a.brightness);
  const payload = { name: a.name.trim(), service: a.service, data };
  if (a.slug) payload.slug = a.slug;
  if (a.img) payload.img = a.img;
  try { await ctx.store.saveAqara(payload); ctx.toast("Saved."); ctx.ui.editingAqara = null; await ctx.refresh(); }
  catch (err) { ctx.toast(`Save failed: ${err.message || err}`); }
}

async function del(ctx, slug) {
  const a = ctx.store.findAqara(slug);
  if (!confirm(`Delete ring effect "${a ? a.name : slug}"?`)) return;
  try { await ctx.store.deleteAqara(slug); ctx.toast("Deleted."); if (ctx.ui.selected === slug) ctx.ui.selected = null; }
  catch (err) { ctx.toast(`Delete failed: ${err.message || err}`); }
  await ctx.refresh();
}
