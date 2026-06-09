// Screen 06 — Target Picker Drawer. Reusable right-side drawer for choosing
// lights/groups. Used by the Look Composer (per binding) and by the Preview
// "test targets" picker. The host opens it by setting ctx.ui.drawer = {...};
// main.js routes drawer clicks/inputs here while it's open.
//
// drawer state shape:
//   { title, subtitle, mode, selected:Set, taken:Map(id->reason),
//     search:"", group:"area"|"capability", apply:fn(ids[]) }

import { esc } from "../store.js";

const CAP_TAG = { "RGB": "rgb", "CCT": "cct", "RGB+CCT": "rgbcct", "Switch": "switch" };

export function renderDrawer(ctx) {
  const d = ctx.ui.drawer;
  if (!d) return "";
  const { store } = ctx;
  const { groups, lights } = store.targetEntities(d.mode || "all");
  const q = (d.search || "").trim().toLowerCase();
  const match = (e) => !q || `${e.label} ${e.id}`.toLowerCase().includes(q);

  const all = [...groups.map((g) => ({ ...g })), ...lights.map((l) => ({ ...l }))].filter(match);
  const available = all.filter((e) => !d.taken.has(e.id)).length;
  const selectedCount = all.filter((e) => d.selected.has(e.id)).length;

  // Build grouping buckets.
  const buckets = new Map();
  const bucketOf = (e) => {
    if (e.group) return "Groups";
    if (d.group === "capability") return e.cap || "Other";
    return e.area || "Ungrouped";
  };
  for (const e of all) {
    const b = bucketOf(e);
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b).push(e);
  }

  const row = (e) => {
    const disabled = d.taken.has(e.id);
    const checked = d.selected.has(e.id);
    const cap = e.group ? "group" : (e.cap || "");
    const capCls = CAP_TAG[cap] || "";
    const reason = disabled ? `<span class="hint" title="${esc(d.taken.get(e.id))}">used in ${esc(d.taken.get(e.id))}</span>` : "";
    return `<label class="tgt ${disabled ? "disabled" : ""}" ${disabled ? "" : `data-drawer="toggle:${esc(e.id)}"`}>
      <input type="checkbox" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}>
      <span class="tgt-name">${esc(e.label)}</span>
      ${cap ? `<span class="tag ${capCls}">${esc(cap)}</span>` : ""}
      ${reason}
    </label>`;
  };

  const list = [...buckets.entries()].map(([name, items]) =>
    `<div class="tgt-head">${esc(name)}</div>${items.map(row).join("")}`
  ).join("") || `<div class="empty" style="padding:16px">No matching targets.</div>`;

  return `
  <div class="drawer-scrim" data-drawer="close"></div>
  <aside class="drawer">
    <div class="drawer-head">
      <div>
        <div class="drawer-title">${esc(d.title || "Select Targets")}</div>
        ${d.subtitle ? `<div class="sub">${d.subtitle}</div>` : ""}
      </div>
      <span class="iconbtn" data-drawer="close" title="Close">✕</span>
    </div>
    <div class="drawer-tools">
      <div class="search"><span class="ic">⌕</span><input data-input="drawer-search" placeholder="Search area, name, entity…" value="${esc(d.search || "")}"></div>
      <div class="seg">
        <span class="seg-btn ${d.group === "area" ? "on" : ""}" data-drawer="group:area">Area</span>
        <span class="seg-btn ${d.group === "capability" ? "on" : ""}" data-drawer="group:capability">Capability</span>
      </div>
    </div>
    <div class="drawer-status">
      <span>${available} available</span><span>${selectedCount} selected</span>
      <span class="btn sm ghost" data-drawer="clear" style="margin-left:auto">Clear</span>
    </div>
    <div class="drawer-list">${list}</div>
    <div class="drawer-foot">
      <div class="hint">Already-used lights are disabled — a light can only be in one binding per look.</div>
      <div class="qa">
        <div class="btn" data-drawer="cancel">Cancel</div>
        <div class="btn primary" data-drawer="apply">Apply Selection</div>
      </div>
    </div>
  </aside>`;
}

// Returns true if it handled the click.
export function onDrawerClick(ctx, e) {
  const d = ctx.ui.drawer;
  if (!d) return false;
  const el = e.target.closest("[data-drawer]");
  if (!el) {
    // clicks inside the drawer (e.g. on the search input) should not fall through
    return !!e.target.closest(".drawer");
  }
  e.stopPropagation();
  const cmd = el.dataset.drawer;
  if (cmd === "close" || cmd === "cancel") { ctx.ui.drawer = null; ctx.renderMain(); return true; }
  if (cmd === "clear") { d.selected.clear(); ctx.renderMain(); return true; }
  if (cmd.startsWith("group:")) { d.group = cmd.slice(6); ctx.renderMain(); return true; }
  if (cmd.startsWith("toggle:")) {
    const id = cmd.slice(7);
    d.selected.has(id) ? d.selected.delete(id) : d.selected.add(id);
    ctx.renderMain();
    return true;
  }
  if (cmd === "apply") {
    const ids = [...d.selected];
    const apply = d.apply;
    ctx.ui.drawer = null;
    if (apply) apply(ids);
    else ctx.renderMain();
    return true;
  }
  return true;
}

export function onDrawerInput(ctx, e) {
  const d = ctx.ui.drawer;
  if (!d) return false;
  if (e.target.closest('[data-input="drawer-search"]')) { d.search = e.target.value; ctx.renderMain(); return true; }
  return false;
}

// Helper for hosts: open a drawer with sensible defaults.
export function openDrawer(ctx, { title, subtitle, mode = "all", selected = [], taken = new Map(), apply }) {
  ctx.ui.drawer = {
    title, subtitle, mode,
    selected: new Set(selected),
    taken: taken instanceof Map ? taken : new Map(taken),
    search: "", group: "area", apply,
  };
  ctx.renderMain();
}
