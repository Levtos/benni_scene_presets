// Screen 01 — Overview / Looks.
// The home screen shows only deployable Looks. Scenes (RGB/Kelvin/Aqara) live
// in their own libraries and never appear here as primary cards. A Look gets
// Play/Stop/Edit; the right panel shows its composition, coverage and validation.

import { DOMAIN, esc } from "../store.js";
import { gradientFor } from "../styles.js";

const KIND_TAG = { rgb: ["RGB", "rgb"], cct: ["CCT", "cct"], rgbcct: ["RGB+CCT", "rgbcct"], off: ["Off", "off"], aqara: ["Aqara Ring", "aqara"], raw: ["Raw", ""] };
const FILTERS = [["all", "All"], ["playing", "Playing"], ["ready", "Ready"], ["warning", "Needs attention"], ["fav", "Favorites"]];

function thumb(look) {
  if (look.img) return `<img src="/assets/${DOMAIN}/${esc(look.img)}" alt="">`;
  return `<div style="width:100%;height:100%;background:${gradientFor(look.slug || look.name)}"></div>`;
}

function lookCard(ctx, look) {
  const { store, favs, ui } = ctx;
  const info = store.lookInfo(look);
  const fav = favs.has(look.slug);
  const playing = info.status === "playing";
  const sel = ui.selected === look.slug ? " selected" : "";
  const statusLabel = { playing: "Playing", ready: "Ready", warning: "Warning", error: "Error" }[info.status];
  return `
  <div class="card${sel}" data-look="${esc(look.slug)}">
    <div class="thumb">
      ${thumb(look)}
      <span class="badge"><span class="status-pill ${info.status}">${statusLabel}</span></span>
      <span class="fav ${fav ? "on" : ""}" data-fav="${esc(look.slug)}" title="Favorite">${fav ? "★" : "☆"}</span>
    </div>
    <div class="body">
      <div class="name">${esc(look.name)}</div>
      <div class="meta">
        <span>${info.bindingCount} binding${info.bindingCount === 1 ? "" : "s"}</span>
        <span>${info.lightCount} light${info.lightCount === 1 ? "" : "s"}</span>
      </div>
      <div class="acts">
        ${playing
          ? `<div class="iconbtn stop" data-stop="${esc(look.slug)}" title="Stop">■</div>`
          : `<div class="iconbtn play" data-play="${esc(look.slug)}" title="Play">▶</div>`}
        <div class="iconbtn" data-edit="${esc(look.slug)}" title="Edit">✎</div>
        <div class="iconbtn" data-del="${esc(look.slug)}" title="Delete">🗑</div>
      </div>
    </div>
  </div>`;
}

function detailPanel(ctx) {
  const { store, ui } = ctx;
  const look = store.looks.find((l) => l.slug === ui.selected) || store.looks[0];
  if (!look) return `<div class="detail"><div class="empty">No looks yet.</div></div>`;
  const info = store.lookInfo(look);
  const playing = info.status === "playing";

  const bindings = (look.bindings || []).map((b) => {
    const [label, cls] = KIND_TAG[store.bindingKind(b)] || ["Scene", ""];
    const source = b.scene || b.aqara || b.service || (b.kind === "off" ? "lights off" : "");
    const n = store.expandList([].concat((b.targets && b.targets.entity_id) || [])).filter((x) => x.startsWith("light.")).length;
    return `<div class="bind-row"><span class="tag ${cls}">${label}</span><span>${esc(source || "—")}</span><span class="t">${n} light${n === 1 ? "" : "s"}</span></div>`;
  }).join("") || `<div class="empty">No bindings.</div>`;

  const cap = info.caps;
  const capChips = [["RGB", cap.rgb, "rgb"], ["CCT", cap.cct, "cct"], ["RGB+CCT", cap.rgbcct, "rgbcct"], ["Aqara Ring", cap.aqara, "aqara"], ["Off", cap.off, "off"]]
    .filter(([, n]) => n > 0).map(([l, n, c]) => `<span class="tag ${c}">${l} ·${n}</span>`).join(" ") || `<span class="tag">—</span>`;

  const check = (ok, text, warn) => `<div class="check ${ok ? "" : warn ? "warn" : "bad"}"><span class="mk">${ok ? "✓" : "✕"}</span>${text}</div>`;

  return `
  <div class="detail">
    <h3>${esc(look.name)}</h3>
    <div class="slug"><code>${esc(look.slug)}</code><span class="iconbtn sm" data-copy="${esc(look.slug)}" title="Copy slug" style="width:24px;height:24px;font-size:11px">⧉</span></div>
    <div class="section">
      <div class="h">Composition</div>
      ${bindings}
    </div>
    <div class="section">
      <div class="h">Coverage &amp; Validation</div>
      ${check(info.checks.hasBindings, "Has at least one binding")}
      ${check(info.checks.noDuplicates, info.duplicates ? `${info.duplicates} light(s) in multiple bindings` : "No duplicate targets")}
      ${check(info.checks.allSupported, info.unsupported ? `${info.unsupported} unsupported target(s)` : "All targets supported")}
      <div class="check"><span class="mk" style="color:var(--cyan)">◆</span>${info.lightCount} light${info.lightCount === 1 ? "" : "s"} covered</div>
    </div>
    <div class="section">
      <div class="h">Capability Summary</div>
      <div>${capChips}</div>
    </div>
    <div class="cta">
      ${playing
        ? `<div class="btn danger" data-stop="${esc(look.slug)}">■ Stop</div>`
        : `<div class="btn primary" data-play="${esc(look.slug)}">▶ Play Look</div>`}
      <div class="btn" data-edit="${esc(look.slug)}">Edit</div>
    </div>
  </div>`;
}

function matches(ctx, look) {
  const { store, ui, favs } = ctx;
  const q = (ui.search || "").trim().toLowerCase();
  if (q && !(`${look.name} ${look.slug}`.toLowerCase().includes(q))) return false;
  const info = store.lookInfo(look);
  switch (ui.filter) {
    case "playing": return info.status === "playing";
    case "ready": return info.status === "ready";
    case "warning": return info.status === "warning" || info.status === "error";
    case "fav": return favs.has(look.slug);
    default: return true;
  }
}

export function render(ctx) {
  const { store, ui, favs } = ctx;
  const looks = store.looks.filter((l) => matches(ctx, l));
  const running = store.looks.filter((l) => store.isLookRunning(l.slug));

  const tabs = FILTERS.map(([k, l]) => `<span class="chip ${ui.filter === k ? "active" : ""}" data-filter="${k}">${l}</span>`).join("");

  const cards = looks.length
    ? `<div class="grid">${looks.map((l) => lookCard(ctx, l)).join("")}
        <div class="card" data-new="look" style="border-style:dashed;align-items:center;justify-content:center;min-height:180px">
          <div class="body" style="align-items:center;color:var(--muted)"><div style="font-size:26px">＋</div><div>New Look</div></div>
        </div></div>`
    : `<div class="empty">No looks match. <span class="btn sm primary" data-new="look" style="margin-left:8px">＋ New Look</span></div>`;

  const nowPlaying = running.length
    ? running.map((l) => `<div class="bind-row"><span class="dot green"></span><span>${esc(l.name)}</span><span class="t">${store.lookInfo(l).lightCount} lights</span><span class="btn sm danger" data-stop="${esc(l.slug)}" style="margin-left:8px">Stop</span></div>`).join("")
    : `<div class="empty" style="padding:14px">Nothing playing.</div>`;

  return `
  <div class="page-head">
    <div>
      <h1>Looks</h1>
      <div class="sub">Deployable light scenes — Play, Stop and manage your looks.</div>
    </div>
    <div class="spacer"></div>
    <div class="search"><span class="ic">⌕</span><input data-input="search" placeholder="Search looks…" value="${esc(ui.search || "")}"></div>
    <div class="btn primary" data-new="look">＋ New Look</div>
  </div>
  <div class="tabs">${tabs}</div>
  <div class="split">
    <div>${cards}</div>
    ${detailPanel(ctx)}
  </div>
  <div class="panels">
    <div class="panel"><div class="h">Now Playing</div>${nowPlaying}</div>
    <div class="panel">
      <div class="h">Quick Actions</div>
      <div class="qa">
        <div class="btn" data-act="stop-all">■ Stop all</div>
        <div class="btn danger" data-act="off-all">⏻ Off all</div>
      </div>
      <div class="sub" style="margin-top:10px;color:var(--comment);font-size:11.5px">Stop all keeps lights on. Off all turns the integration's lights off.</div>
    </div>
  </div>`;
}
