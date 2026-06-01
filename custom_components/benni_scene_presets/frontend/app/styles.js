// Shared stylesheet for the new modular panel. Dracula-inspired dark theme,
// purple + cyan accents. One exported CSS string; the shell injects it once
// into the shadow root. Keep tokens here so every view shares the same look.

export const STYLES = `
:host {
  /* Dracula palette */
  --bg: #21222c;
  --bg-2: #282a36;
  --surface: #2b2e3b;
  --surface-2: #343746;
  --line: #44475a;
  --fg: #f8f8f2;
  --muted: #9aa3c0;
  --comment: #6272a4;
  --purple: #bd93f9;
  --cyan: #8be9fd;
  --green: #50fa7b;
  --pink: #ff79c6;
  --red: #ff5555;
  --yellow: #f1fa8c;
  --orange: #ffb86c;
  --radius: 14px;
  --radius-sm: 9px;
  --shadow: 0 8px 28px rgba(0,0,0,.35);

  display: block;
  height: 100%;
  color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background: var(--bg-2);
}
* { box-sizing: border-box; }

/* ---- layout shell ---- */
.app { display: grid; grid-template-columns: 240px 1fr; height: 100%; min-height: 100%; }

.sidebar {
  background: linear-gradient(180deg, var(--bg) 0%, #1c1d26 100%);
  border-right: 1px solid var(--line);
  display: flex; flex-direction: column;
  padding: 16px 12px; gap: 4px;
}
.brand { display: flex; align-items: center; gap: 10px; padding: 6px 8px 14px; }
.brand .logo {
  width: 30px; height: 30px; border-radius: 8px;
  background: linear-gradient(135deg, var(--purple), var(--cyan));
  display: grid; place-items: center; color: #1c1d26; font-weight: 800;
}
.brand .title { font-weight: 700; font-size: 14px; line-height: 1.1; }
.brand .ver { font-size: 11px; color: var(--comment); }

.nav { display: flex; flex-direction: column; gap: 2px; margin-top: 4px; }
.nav a {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 11px; border-radius: var(--radius-sm);
  color: var(--muted); text-decoration: none; font-size: 13.5px; cursor: pointer;
  border: 1px solid transparent;
}
.nav a:hover { background: var(--surface); color: var(--fg); }
.nav a.active {
  background: linear-gradient(90deg, rgba(189,147,249,.22), rgba(139,233,253,.10));
  color: var(--fg); border-color: rgba(189,147,249,.4);
}
.nav a .ic { width: 18px; text-align: center; opacity: .9; }
.nav .sep { height: 1px; background: var(--line); margin: 10px 6px; opacity: .6; }
.nav .label { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--comment); padding: 6px 10px 2px; }

.sidebar .foot { margin-top: auto; padding-top: 12px; }
.status-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 10px 12px; font-size: 12px; }
.status-card .hdr { color: var(--comment); font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; margin-bottom: 6px; }
.status-card .ln { display: flex; align-items: center; gap: 7px; padding: 2px 0; color: var(--muted); }
.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.dot.green { background: var(--green); box-shadow: 0 0 8px var(--green); }
.dot.yellow { background: var(--yellow); }
.dot.red { background: var(--red); }
.dot.grey { background: var(--comment); }

/* ---- main column ---- */
.main { overflow: auto; padding: 22px 26px 30px; }
.page-head { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 18px; }
.page-head h1 { margin: 0; font-size: 22px; font-weight: 700; }
.page-head .sub { color: var(--muted); font-size: 13px; margin-top: 3px; }
.page-head .spacer { flex: 1; }

.search { display: flex; align-items: center; gap: 8px; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 7px 11px; min-width: 220px; }
.search input { background: none; border: none; color: var(--fg); outline: none; width: 100%; font-size: 13px; }
.search .ic { color: var(--comment); }

.btn { display: inline-flex; align-items: center; gap: 7px; cursor: pointer; border-radius: 10px; padding: 8px 13px; font-size: 13px; font-weight: 600; border: 1px solid var(--line); background: var(--surface); color: var(--fg); }
.btn:hover { background: var(--surface-2); }
.btn.primary { background: linear-gradient(135deg, var(--purple), #9d6ff0); border-color: transparent; color: #1c1d26; }
.btn.primary:hover { filter: brightness(1.07); }
.btn.ghost { background: transparent; }
.btn.sm { padding: 6px 10px; font-size: 12px; }
.btn.danger { color: var(--red); border-color: rgba(255,85,85,.4); }
.btn.danger:hover { background: rgba(255,85,85,.12); }

.tabs { display: flex; gap: 6px; margin-bottom: 16px; flex-wrap: wrap; }
.chip { cursor: pointer; padding: 6px 13px; border-radius: 999px; font-size: 12.5px; border: 1px solid var(--line); background: var(--surface); color: var(--muted); }
.chip:hover { color: var(--fg); }
.chip.active { background: rgba(139,233,253,.14); border-color: rgba(139,233,253,.5); color: var(--fg); }

/* content + detail split */
.split { display: grid; grid-template-columns: 1fr 340px; gap: 20px; align-items: start; }
@media (max-width: 1100px) { .split { grid-template-columns: 1fr; } .detail { display: none; } }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }

.card {
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
  overflow: hidden; cursor: pointer; transition: border-color .12s, transform .12s;
  display: flex; flex-direction: column;
}
.card:hover { border-color: var(--purple); transform: translateY(-2px); }
.card.selected { border-color: var(--cyan); box-shadow: 0 0 0 1px var(--cyan) inset; }
.card .thumb { height: 96px; position: relative; background: var(--surface-2); }
.card .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.card .badge { position: absolute; top: 8px; left: 8px; font-size: 10.5px; font-weight: 700; padding: 3px 8px; border-radius: 999px; backdrop-filter: blur(4px); background: rgba(0,0,0,.45); display: inline-flex; align-items: center; gap: 5px; }
.card .fav { position: absolute; top: 7px; right: 8px; font-size: 15px; color: rgba(255,255,255,.55); cursor: pointer; }
.card .fav.on { color: var(--yellow); }
.card .body { padding: 11px 12px 12px; display: flex; flex-direction: column; gap: 8px; }
.card .name { font-weight: 650; font-size: 14px; }
.card .meta { display: flex; gap: 12px; color: var(--muted); font-size: 11.5px; }
.card .acts { display: flex; gap: 6px; margin-top: 2px; }
.iconbtn { width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg-2); color: var(--fg); display: grid; place-items: center; cursor: pointer; font-size: 13px; }
.iconbtn:hover { background: var(--surface-2); }
.iconbtn.play { color: var(--green); border-color: rgba(80,250,123,.35); }
.iconbtn.stop { color: var(--red); border-color: rgba(255,85,85,.35); }

.status-pill { font-size: 10.5px; font-weight: 700; padding: 2px 7px; border-radius: 999px; }
.status-pill.playing { background: rgba(80,250,123,.16); color: var(--green); }
.status-pill.ready { background: rgba(154,163,192,.16); color: var(--muted); }
.status-pill.warning { background: rgba(241,250,140,.16); color: var(--yellow); }
.status-pill.error { background: rgba(255,85,85,.16); color: var(--red); }

/* detail panel */
.detail { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px; position: sticky; top: 8px; }
.detail h3 { margin: 0 0 2px; font-size: 16px; }
.detail .slug { display: flex; align-items: center; gap: 6px; color: var(--comment); font-size: 12px; margin-bottom: 12px; }
.detail .slug code { background: var(--bg-2); padding: 2px 6px; border-radius: 6px; }
.detail .section { margin-top: 14px; }
.detail .section .h { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--comment); margin-bottom: 7px; }
.bind-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; background: var(--bg-2); border: 1px solid var(--line); border-radius: 8px; margin-bottom: 6px; font-size: 12.5px; }
.bind-row .k { font-weight: 700; }
.bind-row .t { margin-left: auto; color: var(--muted); font-size: 11.5px; }
.tag { font-size: 10.5px; padding: 2px 7px; border-radius: 6px; background: var(--surface-2); color: var(--muted); border: 1px solid var(--line); }
.tag.rgb { color: var(--pink); } .tag.cct { color: var(--orange); } .tag.rgbcct { color: var(--cyan); } .tag.off { color: var(--comment); } .tag.aqara { color: var(--purple); }
.check { display: flex; align-items: center; gap: 8px; font-size: 12.5px; padding: 3px 0; color: var(--muted); }
.check .mk { color: var(--green); } .check.bad .mk { color: var(--red); } .check.warn .mk { color: var(--yellow); }
.detail .cta { display: flex; gap: 8px; margin-top: 16px; }
.detail .cta .btn { flex: 1; justify-content: center; }

/* bottom panels */
.panels { display: grid; grid-template-columns: 1fr 320px; gap: 20px; margin-top: 26px; }
@media (max-width: 1100px) { .panels { grid-template-columns: 1fr; } }
.panel { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px; }
.panel .h { font-size: 13px; font-weight: 700; margin-bottom: 10px; display: flex; align-items: center; }
.panel .h .spacer { flex: 1; }
.qa { display: flex; gap: 10px; }
.qa .btn { flex: 1; justify-content: center; }
.empty { color: var(--comment); font-size: 13px; padding: 28px; text-align: center; border: 1px dashed var(--line); border-radius: var(--radius); }

.placeholder { display: grid; place-items: center; height: 60vh; color: var(--comment); text-align: center; gap: 8px; }
.placeholder .big { font-size: 18px; color: var(--muted); }

/* toast */
.toast { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%); background: var(--surface-2); color: var(--fg); border: 1px solid var(--line); padding: 10px 16px; border-radius: 10px; box-shadow: var(--shadow); font-size: 13px; z-index: 50; opacity: 0; transition: opacity .2s; pointer-events: none; }
.toast.show { opacity: 1; }
`;

// A deterministic gradient for cards without an image, derived from the name.
export function gradientFor(seed) {
  let h = 0;
  for (let i = 0; i < (seed || "").length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = h % 360, b = (a + 60 + (h % 80)) % 360;
  return `linear-gradient(135deg, hsl(${a} 70% 55%), hsl(${b} 65% 45%))`;
}
