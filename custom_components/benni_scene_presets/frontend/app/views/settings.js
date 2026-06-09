// Settings — small utility screen: library counts and a guarded reset.

import { DOMAIN, esc } from "../store.js";

export function render(ctx) {
  const s = ctx.store;
  const row = (k, v) => `<div class="bind-row"><span>${k}</span><span class="t">${v}</span></div>`;
  const categories = s.categories();
  const categoryRows = categories.length
    ? categories.map((c) => `<div class="bind-row"><span>${esc(c)}</span><span class="iconbtn" data-cat-del="${esc(c)}" title="Delete category">✕</span></div>`).join("")
    : `<div class="empty" style="padding:14px">No categories yet.</div>`;
  return `
  <div class="page-head"><div><h1>Settings</h1><div class="sub">Library overview and maintenance.</div></div></div>
  <div class="split">
    <div>
      <div class="form-card">
        <div class="h">Library</div>
        ${row("Looks", s.looks.length)}
        ${row("RGB Scenes", s.rgbScenes().length)}
        ${row("Kelvin Scenes", s.kelvinScenes().length)}
        ${row("Aqara Ring Effects", s.aqara.length)}
        ${row("Running scenes", s.dynamic.length)}
      </div>
      <div class="form-card">
        <div class="h">Categories</div>
        <div class="frow"><label>New category</label><input data-cat-name placeholder="e.g. Gaming"><span class="btn sm primary" data-cat-add>＋ Add</span></div>
        <div class="hint" style="margin-bottom:10px">Categories are shared by Looks, RGB/Kelvin Scenes and Aqara Ring Effects.</div>
        ${categoryRows}
      </div>
    </div>
    <div class="form-card">
      <div class="h">Maintenance</div>
      <div class="hint" style="margin-bottom:10px">Reset stops everything and wipes custom scenes, looks and ring effects. This cannot be undone.</div>
      <div class="btn danger" data-set="reset">Reset user data…</div>
    </div>
  </div>`;
}

export function onClick(ctx, e) {
  let el;
  if ((el = e.target.closest("[data-cat-add]"))) { addCategory(ctx, el); return; }
  if ((el = e.target.closest("[data-cat-del]"))) { deleteCategory(ctx, el.dataset.catDel); return; }
  if (!e.target.closest('[data-set="reset"]')) return;
  if (!confirm("Reset ALL custom scenes, looks and ring effects? This cannot be undone.")) return;
  ctx.hass.callService(DOMAIN, "reset_userdata", { delete_images: true })
    .then(() => { ctx.toast("User data reset."); return ctx.refresh(); })
    .catch((err) => ctx.toast(`Reset failed: ${err.message || err}`));
}

async function addCategory(ctx, trigger) {
  const root = trigger.getRootNode();
  const input = root.querySelector("[data-cat-name]");
  const name = (input && input.value || "").trim();
  if (!name) { ctx.toast("Enter a category name."); return; }
  const categories = ctx.store.categories();
  if (categories.some((c) => c.toLowerCase() === name.toLowerCase())) {
    ctx.toast("Category already exists.");
    return;
  }
  try {
    await ctx.store.saveCategories([...categories, name]);
    ctx.toast("Category added.");
    await ctx.refresh();
    ctx.renderMain();
  } catch (err) { ctx.toast(`Save failed: ${err.message || err}`); }
}

async function deleteCategory(ctx, name) {
  if (!confirm(`Delete category "${name}"? Items assigned to it will become uncategorized.`)) return;
  const categories = ctx.store.categories().filter((c) => c !== name);
  try {
    await ctx.store.saveCategories(categories);
    ctx.toast("Category deleted.");
    await ctx.refresh();
    ctx.renderMain();
  } catch (err) { ctx.toast(`Delete failed: ${err.message || err}`); }
}
