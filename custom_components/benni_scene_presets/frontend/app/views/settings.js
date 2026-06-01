// Settings — small utility screen: library counts and a guarded reset.

import { DOMAIN } from "../store.js";

export function render(ctx) {
  const s = ctx.store;
  const row = (k, v) => `<div class="bind-row"><span>${k}</span><span class="t">${v}</span></div>`;
  return `
  <div class="page-head"><div><h1>Settings</h1><div class="sub">Library overview and maintenance.</div></div></div>
  <div class="split">
    <div class="form-card">
      <div class="h">Library</div>
      ${row("Looks", s.looks.length)}
      ${row("RGB Scenes", s.rgbScenes().length)}
      ${row("Kelvin Scenes", s.kelvinScenes().length)}
      ${row("Aqara Ring Effects", s.aqara.length)}
      ${row("Running scenes", s.dynamic.length)}
    </div>
    <div class="form-card">
      <div class="h">Maintenance</div>
      <div class="hint" style="margin-bottom:10px">Reset stops everything and wipes custom scenes, looks and ring effects. This cannot be undone.</div>
      <div class="btn danger" data-set="reset">Reset user data…</div>
    </div>
  </div>`;
}

export function onClick(ctx, e) {
  if (!e.target.closest('[data-set="reset"]')) return;
  if (!confirm("Reset ALL custom scenes, looks and ring effects? This cannot be undone.")) return;
  ctx.hass.callService(DOMAIN, "reset_userdata", { delete_images: true })
    .then(() => { ctx.toast("User data reset."); return ctx.refresh(); })
    .catch((err) => ctx.toast(`Reset failed: ${err.message || err}`));
}
