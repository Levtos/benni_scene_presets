// Screens 02 + 03 — RGB Scenes Library and Kelvin Scenes Library.
// One module, driven by ctx.ui.section ("rgb" | "kelvin"). Scenes are
// device-agnostic, reusable building blocks with no persistent targets; the
// only target use here is an optional Preview on shared "test targets".

import { DOMAIN, esc, kelvinToHex } from "../store.js";
import { gradientFor } from "../styles.js";

const MODES = {
  rgb: {
    title: "RGB Scenes", sub: "Reusable colour palettes for RGB and RGB+CCT lights.",
    list: (s) => s.rgbScenes(), newLabel: "New RGB Scene",
    filters: [["all", "All"], ["dynamic", "Dynamic"], ["static", "Static"], ["fav", "Favorites"]],
    compat: ["RGB", "RGB+CCT", "not for CCT-only lights"],
  },
  kelvin: {
    title: "Kelvin Scenes", sub: "White-temperature scenes for CCT and RGB+CCT lights.",
    list: (s) => s.kelvinScenes(), newLabel: "New Kelvin Scene",
    filters: [["all", "All"], ["sweep", "Sweep"], ["static", "Static"], ["fav", "Favorites"]],
    compat: ["CCT", "RGB+CCT", "not for RGB-only lights"],
  },
};

const modeOf = (ctx) => (ctx.ui.section === "kelvin" ? "kelvin" : "rgb");

function colours(store, p) {
  if (store.isKelvinScene(p)) return store.presetKelvins(p).map(kelvinToHex);
  return (p.lights || []).map((l) => l.hex).filter(Boolean);
}
function sceneGradient(store, p) {
  if (p.img) return `background-image:url('/assets/${DOMAIN}/${esc(p.img)}');background-size:cover;background-position:center`;
  const cs = colours(store, p);
  if (cs.length > 1) return `background:linear-gradient(135deg,${cs.join(",")})`;
  if (cs.length === 1) return `background:linear-gradient(135deg,${cs[0]},#00000055)`;
  return `background:${gradientFor(p.slug || p.name)}`;
}
function typeBadge(store, p) {
  if (store.isKelvinScene(p)) return store.presetKelvins(p).length > 1 ? "Sweep" : "Static";
  return store.isDynamicScene(p) ? "Dynamic" : "Static";
}

function card(ctx, p) {
  const { store, favs, ui } = ctx;
  const cs = colours(store, p);
  const sel = ui.selected === p.slug ? " selected" : "";
  const count = store.isKelvinScene(p) ? `${store.presetKelvins(p).length} stop${store.presetKelvins(p).length === 1 ? "" : "s"}` : `${cs.length} colour${cs.length === 1 ? "" : "s"}`;
  return `
  <div class="card${sel}" data-scene="${esc(p.slug)}">
    <div class="thumb" style="${sceneGradient(store, p)}">
      <span class="badge"><span class="status-pill ready">${typeBadge(store, p)}</span></span>
      <span class="fav ${favs.has(p.slug) ? "on" : ""}" data-fav="${esc(p.slug)}" title="Favorite">${favs.has(p.slug) ? "★" : "☆"}</span>
    </div>
    <div class="body">
      <div class="name">${esc(p.name)}</div>
      <div class="meta"><span>${count}</span><span>${p.interval != null ? p.interval + "s int" : ""}</span><span>${p.transition != null ? p.transition + "s trans" : ""}</span></div>
      <div class="acts">
        <div class="iconbtn play" data-preview="${esc(p.slug)}" title="Preview on test targets">▶</div>
        <div class="iconbtn" data-edit="${esc(p.slug)}" title="Edit">✎</div>
        <div class="iconbtn" data-del="${esc(p.slug)}" title="Delete">🗑</div>
      </div>
    </div>
  </div>`;
}

function detail(ctx, m) {
  const { store, ui } = ctx;
  const list = m.list(store);
  const p = list.find((x) => x.slug === ui.selected) || list[0];
  if (!p) return `<div class="detail"><div class="empty">No scenes yet.</div></div>`;
  const cs = colours(store, p);
  const isK = store.isKelvinScene(p);
  const swatches = cs.map((c) => `<i class="sw" style="background:${c}"></i>`).join("");
  const usedIn = store.looksUsingScene(p.slug);
  const rows = [
    ["Category", p.category || "—"],
    ["Type", typeBadge(store, p)],
    [isK ? "Kelvin stops" : "Colours", isK ? store.presetKelvins(p).join(" → ") + " K" : cs.length],
    ["Interval", p.interval != null ? p.interval + "s" : "—"],
    ["Transition", p.transition != null ? p.transition + "s" : "—"],
  ];
  if (!isK) rows.push(["Shuffle", p.shuffle ? "enabled" : "disabled"]);
  return `
  <div class="detail">
    <div class="thumb" style="height:120px;border-radius:10px;${sceneGradient(store, p)}"></div>
    <h3 style="margin-top:12px">${esc(p.name)}</h3>
    <div class="slug"><code>${esc(p.slug)}</code><span class="iconbtn" data-copy="${esc(p.slug)}" style="width:24px;height:24px;font-size:11px">⧉</span></div>
    <div class="sw-row" style="margin:6px 0 2px">${swatches}</div>
    <div class="section"><div class="h">Details</div>
      ${rows.map(([k, v]) => `<div class="bind-row"><span>${k}</span><span class="t">${esc(String(v))}</span></div>`).join("")}
    </div>
    ${p.description ? `<div class="section"><div class="h">Description</div><div class="sub">${esc(p.description)}</div></div>` : ""}
    <div class="section"><div class="h">Compatibility</div><div>${m.compat.map((c) => `<span class="tag">${c}</span>`).join(" ")}</div></div>
    ${usedIn.length ? `<div class="section"><div class="h">Used in Looks</div>${usedIn.map((l) => `<div class="bind-row"><span>${esc(l.name)}</span></div>`).join("")}</div>` : ""}
    <div class="cta">
      <div class="btn primary" data-preview="${esc(p.slug)}">▶ Preview</div>
      <div class="btn" data-edit="${esc(p.slug)}">Edit</div>
    </div>
  </div>`;
}

function passesFilter(ctx, m, p) {
  const { store, ui, favs } = ctx;
  const q = (ui.search || "").trim().toLowerCase();
  if (q && !(`${p.name} ${p.slug} ${p.category || ""}`.toLowerCase().includes(q))) return false;
  if (ui.category && ui.category !== "all" && p.category !== ui.category) return false;
  switch (ui.filter) {
    case "dynamic": return store.isDynamicScene(p);
    case "sweep": return store.presetKelvins(p) && store.presetKelvins(p).length > 1;
    case "static": return !store.isDynamicScene(p);
    case "fav": return favs.has(p.slug);
    default: return true;
  }
}

export function render(ctx) {
  const m = MODES[modeOf(ctx)];
  const { store, ui } = ctx;
  const list = m.list(store).filter((p) => passesFilter(ctx, m, p));
  const tabs = m.filters.map(([k, l]) => `<span class="chip ${ui.filter === k ? "active" : ""}" data-filter="${k}">${l}</span>`).join("");
  const cats = store.categories(m.list(store));
  const catTabs = cats.length
    ? `<div class="tabs cats"><span class="chip ${!ui.category || ui.category === "all" ? "active" : ""}" data-category="all">All Categories</span>${cats.map((c) => `<span class="chip ${ui.category === c ? "active" : ""}" data-category="${esc(c)}">${esc(c)}</span>`).join("")}</div>`
    : "";
  const testN = (ui.testTargets || []).length;

  const grid = list.length || (m.list(store).length)
    ? `<div class="grid">${list.map((p) => card(ctx, p)).join("")}
        <div class="card" data-new="scene" style="border-style:dashed;align-items:center;justify-content:center;min-height:180px">
          <div class="body" style="align-items:center;color:var(--muted)"><div style="font-size:26px">＋</div><div>${m.newLabel}</div></div>
        </div></div>`
    : `<div class="empty">No scenes yet. <span class="btn sm primary" data-new="scene" style="margin-left:8px">＋ ${m.newLabel}</span></div>`;

  return `
  <div class="page-head">
    <div><h1>${m.title}</h1><div class="sub">${m.sub}</div></div>
    <div class="spacer"></div>
    <div class="search"><span class="ic">⌕</span><input data-input="search" placeholder="Search scenes…" value="${esc(ui.search || "")}"></div>
    <div class="btn" data-act="test-targets" title="Lights used for Preview">⚙ Test targets (${testN})</div>
    <div class="btn primary" data-new="scene">＋ ${m.newLabel}</div>
  </div>
  <div class="tabs">${tabs}</div>
  ${catTabs}
  <div class="split"><div>${grid}</div>${detail(ctx, m)}</div>`;
}

export function onClick(ctx, e) {
  const { store, ui } = ctx;
  const mode = modeOf(ctx);
  const t = (sel) => e.target.closest(sel);
  let el;
  if ((el = t("[data-filter]"))) { ui.filter = el.dataset.filter; ctx.renderMain(); return; }
  if ((el = t("[data-category]"))) { ui.category = el.dataset.category; ctx.renderMain(); return; }
  if ((el = t("[data-preview]"))) { e.stopPropagation(); preview(ctx, el.dataset.preview); return; }
  if ((el = t("[data-edit]"))) { e.stopPropagation(); const p = store.findPreset(el.dataset.edit); if (p) { ctx.views.editor.editFrom(ctx, p); ctx.navigate("editor"); } return; }
  if ((el = t("[data-del]"))) { e.stopPropagation(); del(ctx, el.dataset.del); return; }
  if ((el = t("[data-new]"))) { e.stopPropagation(); ctx.views.editor.newScene(ctx, mode); ctx.navigate("editor"); return; }
  if ((el = t('[data-act="test-targets"]'))) { openTestTargets(ctx); return; }
  if ((el = t("[data-scene]"))) { ui.selected = el.dataset.scene; ctx.renderMain(); return; }
}

function openTestTargets(ctx) {
  ctx.openDrawer({
    title: "Test Targets", subtitle: "Lights used for Preview only — not saved with scenes.",
    mode: "all", selected: ctx.ui.testTargets || [],
    apply: (ids) => { ctx.saveTestTargets(ids); ctx.toast(`${ids.length} test target${ids.length === 1 ? "" : "s"} set.`); ctx.renderMain(); },
  });
}

async function preview(ctx, slug) {
  const { store } = ctx;
  const p = store.findPreset(slug);
  if (!p) return;
  const entity_id = store.expandList(ctx.ui.testTargets || []);
  if (!entity_id.length) { ctx.toast("Pick test targets first (⚙ Test targets)."); openTestTargets(ctx); return; }
  try {
    if (store.isKelvinScene(p)) await store.applyPreview({ entity_id, kelvin: store.presetKelvins(p)[0] });
    else await store.applyPreview({ entity_id, colors: (p.lights || []).map((l) => l.hex) });
    ctx.toast(`Previewing "${p.name}".`);
  } catch (err) { ctx.toast(`Preview failed: ${err.message || err}`); }
}

async function del(ctx, slug) {
  const p = ctx.store.findPreset(slug);
  if (!confirm(`Delete scene "${p ? p.name : slug}"?`)) return;
  try { await ctx.store.deletePreset(slug); ctx.toast("Deleted."); if (ctx.ui.selected === slug) ctx.ui.selected = null; }
  catch (err) { ctx.toast(`Delete failed: ${err.message || err}`); }
  await ctx.refresh();
}
