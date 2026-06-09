// Screen 05 — Look Composer (+ Screen 06 Target Picker Drawer via components/drawer).
// The central editor for deployable Looks. Only Looks carry persistent targets.
// A Look is a list of bindings; each binding maps targets to one action
// (RGB/Kelvin scene, Aqara ring effect, raw effect, or off). One light may be
// used by only one binding per look — enforced through the target drawer.

import { DOMAIN, esc, slugify } from "../store.js";

const KIND_OPTS = [
  ["scene", "Scene"], ["aqara", "Aqara Ring Effect"], ["off", "Off"], ["switch", "Switch"], ["effect", "Raw Effect"],
];
const blankBinding = () => ({ kind: "scene", entity_ids: [], scene: "", interval: "", transition: "", aqara: "", service: "aqara_advanced_lighting.set_dynamic_effect", effect: "", action: "turn_on" });
const blankLook = () => ({ slug: null, name: "", category: "", img: null, transition: "", description: "", bindings: [blankBinding()] });

export function startNew(ctx) { ctx.ui.editingLook = blankLook(); }
export function editFrom(ctx, look) {
  ctx.ui.editingLook = {
    slug: look.slug, name: look.name || "", category: look.category || "", img: look.img || null,
    transition: look.transition != null ? look.transition : "", description: look.description || "",
    bindings: (look.bindings || []).map((b) => ({
      kind: b.kind || "scene",
      entity_ids: b.targets && b.targets.entity_id ? [].concat(b.targets.entity_id) : [],
      scene: b.scene || "", interval: b.interval != null ? b.interval : "", transition: b.transition != null ? b.transition : "",
      aqara: b.aqara || "", service: b.service || "aqara_advanced_lighting.set_dynamic_effect", effect: (b.data && b.data.effect) || "",
      action: b.action || "turn_on",
    })),
  };
  if (!ctx.ui.editingLook.bindings.length) ctx.ui.editingLook.bindings = [blankBinding()];
}

// Normalized look (targets.entity_id) so store.lookInfo can read it.
function normalized(l) {
  return { slug: l.slug, bindings: l.bindings.map((b) => ({ kind: b.kind, scene: b.scene, aqara: b.aqara, action: b.action, targets: { entity_id: b.entity_ids } })) };
}

const KIND_TAG = { rgb: ["RGB", "rgb"], cct: ["CCT", "cct"], rgbcct: ["RGB+CCT", "rgbcct"], off: ["Off", "off"], aqara: ["Aqara Ring", "aqara"], raw: ["Raw", ""], switch: ["Switch", "switch"] };

function bindingTargetIds(store, b) {
  return b.kind === "switch" ? b.entity_ids : store.expandList(b.entity_ids);
}

function targetChips(store, ids) {
  const targets = [...new Set(ids || [])];
  if (!targets.length) return `<div class="target-list empty-targets">No targets selected.</div>`;
  return `<div class="target-list">${targets.map((id) => {
    const kind = id.startsWith("switch.") ? "switch" : id.startsWith("light.") ? "light" : "group";
    return `<span class="target-chip ${kind}" title="${esc(id)}">${esc(store.friendly(id))}</span>`;
  }).join("")}</div>`;
}

function bindingRow(ctx, b, idx) {
  const { store } = ctx;
  const ids = bindingTargetIds(store, b);
  const isSwitch = b.kind === "switch";
  const n = ids.filter((x) => isSwitch ? x.startsWith("switch.") : x.startsWith("light.")).length;
  const [capLabel, capCls] = KIND_TAG[store.bindingKind(b)] || ["Scene", ""];

  let source = "";
  if (b.kind === "scene") {
    source = `<div class="frow"><label>Scene</label><select data-bscene="${idx}"><option value="">– pick a scene –</option>${store.presets.map((p) => `<option value="${esc(p.slug)}" ${b.scene === p.slug ? "selected" : ""}>${esc(p.name)}${store.isKelvinScene(p) ? " (Kelvin)" : ""}</option>`).join("")}</select></div>`;
  } else if (b.kind === "aqara") {
    source = `<div class="frow"><label>Ring effect</label><select data-baqara="${idx}"><option value="">– pick –</option>${store.aqara.map((a) => `<option value="${esc(a.slug)}" ${b.aqara === a.slug ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></div>`;
  } else if (b.kind === "effect") {
    source = `<div class="frow"><label>Service</label><input data-bsvc="${idx}" value="${esc(b.service)}" placeholder="domain.service"></div>
              <div class="frow"><label>Effect</label><input data-beff="${idx}" value="${esc(b.effect)}" placeholder="effect name"></div>`;
  } else if (b.kind === "switch") {
    source = `<div class="frow"><label>Action</label><select data-bswitch-action="${idx}">
      ${[["turn_on", "Turn on"], ["turn_off", "Turn off"]].map(([v, l]) => `<option value="${v}" ${b.action === v ? "selected" : ""}>${l}</option>`).join("")}
    </select></div>`;
  } else {
    source = `<div class="hint">These lights are turned off when the look is applied.</div>`;
  }

  return `
  <div class="binding">
    <div class="binding-head">
      <span class="idx">${idx + 1}</span>
      <select data-bk="${idx}">${KIND_OPTS.map(([v, l]) => `<option value="${v}" ${b.kind === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      <span class="tag ${capCls}">${capLabel}</span>
      <span class="spacer" style="flex:1"></span>
      <span class="iconbtn" data-dup="${idx}" title="Duplicate">⧉</span>
      <span class="iconbtn" data-brm="${idx}" title="Delete">🗑</span>
    </div>
    ${source}
    <div class="frow"><label>Targets</label>
      <span class="targets-pill">${n} ${isSwitch ? "switch" : "light"}${n === 1 ? "" : "s"}</span>
      <span class="btn sm" data-edit-targets="${idx}">Edit Targets</span>
    </div>
    ${targetChips(store, b.entity_ids)}
  </div>`;
}

function coveragePanel(ctx, l) {
  const info = ctx.store.lookInfo(normalized(l));
  const cap = info.caps;
  const capChips = [["RGB", cap.rgb, "rgb"], ["CCT", cap.cct, "cct"], ["Aqara Ring", cap.aqara, "aqara"], ["Off", cap.off, "off"], ["Switch", cap.switch, "switch"], ["Raw", cap.raw, ""]]
    .filter(([, n]) => n > 0).map(([k, n, c]) => `<span class="tag ${c}">${k} ·${n}</span>`).join(" ") || `<span class="tag">—</span>`;
  const check = (ok, text) => `<div class="check ${ok ? "" : "bad"}"><span class="mk">${ok ? "✓" : "✕"}</span>${text}</div>`;
  return `
  <div class="detail">
    <div class="h" style="font-size:13px;font-weight:700;margin-bottom:8px">Coverage &amp; Validation</div>
    <div class="cov-num">${info.lightCount}<span>lights covered${info.switchCount ? ` · ${info.switchCount} switches` : ""}</span></div>
    <div class="section">
      ${check(info.checks.noDuplicates, info.duplicates ? `${info.duplicates} duplicate target(s)` : "No duplicate targets")}
      ${check(info.checks.allSupported, info.unsupported ? `${info.unsupported} unsupported target(s)` : "All targets supported")}
      ${check(info.checks.hasBindings, "At least one binding")}
    </div>
    <div class="section"><div class="h">Capability Summary</div><div>${capChips}</div></div>
    <div class="hint">Bindings are shown top-to-bottom but run on their own targets.</div>
  </div>`;
}

export function render(ctx) {
  const l = ctx.ui.editingLook;
  if (!l) { startNew(ctx); return render(ctx); }
  const bindings = l.bindings.map((b, i) => bindingRow(ctx, b, i)).join("");
  const categoryOptions = ctx.store.categoryOptions(l.category);
  return `
  <div class="page-head">
    <div><h1>Look Composer</h1><div class="sub">Build and edit deployable looks.</div></div>
    <div class="spacer"></div>
    <div class="btn" data-lc="cancel">Cancel</div>
    <div class="btn primary" data-lc="save">Save Look</div>
  </div>
  <div class="split">
    <div>
      <div class="form-card">
        <div class="frow"><label>Image</label><input type="file" accept="image/*" data-img>${l.img ? `<img class="imgprev" src="/assets/${DOMAIN}/${esc(l.img)}">` : ""}</div>
        <div class="frow"><label>Look Name</label><input data-lf="name" value="${esc(l.name)}" placeholder="Look name"></div>
        <div class="frow"><label>Slug</label><code class="slugpv">${esc(l.slug || slugify(l.name))}</code></div>
        <div class="frow"><label>Category</label><select data-lf="category"><option value="">Uncategorized</option>${categoryOptions.map((c) => `<option value="${esc(c)}" ${l.category === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>
        <div class="frow"><label>Transition (s)</label><input type="number" min="0" max="300" data-lf="transition" value="${esc(l.transition)}" placeholder="optional" style="width:110px"></div>
        <div class="frow"><label>Description</label><input data-lf="description" value="${esc(l.description)}" placeholder="optional"></div>
      </div>
      <div class="binding-head-bar"><div class="h" style="font-weight:700">Bindings</div><span class="spacer" style="flex:1"></span><span class="btn sm" data-rest-off>Rest off</span><span class="btn sm primary" data-add-binding>＋ Add Binding</span></div>
      ${bindings}
      <div class="btn" data-add-binding style="margin-top:8px">＋ Add Binding</div>
    </div>
    ${coveragePanel(ctx, l)}
  </div>`;
}

export function onClick(ctx, e) {
  const l = ctx.ui.editingLook; if (!l) return;
  const t = (sel) => e.target.closest(sel);
  let el;
  if ((el = t("[data-lc]"))) {
    if (el.dataset.lc === "cancel") { ctx.ui.editingLook = null; ctx.navigate("overview"); return; }
    if (el.dataset.lc === "save") { save(ctx); return; }
  }
  if (t("[data-add-binding]")) { l.bindings.push(blankBinding()); ctx.renderMain(); return; }
  if (t("[data-rest-off]")) { restOff(ctx); return; }
  if ((el = t("[data-dup]"))) { const i = Number(el.dataset.dup); l.bindings.splice(i + 1, 0, { ...l.bindings[i], entity_ids: [] }); ctx.renderMain(); return; }
  if ((el = t("[data-brm]"))) { const i = Number(el.dataset.brm); l.bindings.splice(i, 1); if (!l.bindings.length) l.bindings = [blankBinding()]; ctx.renderMain(); return; }
  if ((el = t("[data-edit-targets]"))) { openTargets(ctx, Number(el.dataset.editTargets)); return; }
}

export function onInput(ctx, e) {
  const l = ctx.ui.editingLook; if (!l) return;
  let el;
  if ((el = e.target.closest("[data-lf]"))) {
    l[el.dataset.lf] = el.value;
    if (el.dataset.lf === "name" && !l.slug) { const pv = e.target.getRootNode().querySelector(".slugpv"); if (pv) pv.textContent = slugify(el.value); }
    return;
  }
  if ((el = e.target.closest("[data-bsvc]"))) { l.bindings[Number(el.dataset.bsvc)].service = el.value; return; }
  if ((el = e.target.closest("[data-beff]"))) { l.bindings[Number(el.dataset.beff)].effect = el.value; return; }
}

export function onChange(ctx, e) {
  const l = ctx.ui.editingLook; if (!l) return;
  let el;
  if ((el = e.target.closest("[data-lf]"))) { l[el.dataset.lf] = el.value; return; }
  if ((el = e.target.closest("[data-bk]"))) { setKind(ctx, Number(el.dataset.bk), el.value); return; }
  if ((el = e.target.closest("[data-bscene]"))) {
    const b = l.bindings[Number(el.dataset.bscene)]; b.scene = el.value;
    // drop targets the new scene's capability rejects
    const mode = ctx.store.sceneTargetMode(b.scene);
    b.entity_ids = b.entity_ids.filter((id) => id.startsWith("light.") ? ctx.store.lightPasses(id, mode) : ctx.store.groupPasses(id, mode));
    ctx.renderMain(); return;
  }
  if ((el = e.target.closest("[data-baqara]"))) { l.bindings[Number(el.dataset.baqara)].aqara = el.value; ctx.renderMain(); return; }
  if ((el = e.target.closest("[data-bswitch-action]"))) { l.bindings[Number(el.dataset.bswitchAction)].action = el.value; return; }
  if ((el = e.target.closest("[data-img]"))) { if (el.files && el.files[0]) upload(ctx, el.files[0]); return; }
}

function setKind(ctx, idx, kind) {
  const b = ctx.ui.editingLook.bindings[idx];
  b.kind = kind;
  if (kind === "switch") {
    b.action = b.action || "turn_on";
    b.entity_ids = b.entity_ids.filter((id) => ctx.store.isSwitchTargetId(id));
  } else {
    b.entity_ids = b.entity_ids.filter((id) => ctx.store.isLightTargetId(id));
  }
  ctx.renderMain();
}

function openTargets(ctx, idx) {
  const l = ctx.ui.editingLook;
  const b = l.bindings[idx];
  const mode = b.kind === "switch" ? "switch" : (b.kind === "scene" ? ctx.store.sceneTargetMode(b.scene) : "all");
  // lights claimed by other bindings -> disabled, with the claiming binding's label
  const taken = new Map();
  l.bindings.forEach((other, i) => {
    if (i === idx) return;
    if (b.kind === "switch" && other.kind !== "switch") return;
    if (b.kind !== "switch" && other.kind === "switch") return;
    const label = other.scene || other.aqara || other.kind || `binding ${i + 1}`;
    const ids = other.kind === "switch" ? other.entity_ids : ctx.store.expandList(other.entity_ids);
    for (const id of ids) taken.set(id, label || `binding ${i + 1}`);
  });
  const subtitle = mode === "switch" ? "Switches available in Settings." : mode === "white" ? "Kelvin scene — only white-capable lights." : mode === "color" ? "Colour scene — only colour-capable lights." : "Managed light targets.";
  ctx.openDrawer({
    title: `Targets · ${KIND_OPTS.find(([v]) => v === b.kind)[1]}`, subtitle,
    mode, selected: b.entity_ids, taken,
    apply: (ids) => { b.entity_ids = ids; ctx.renderMain(); },
  });
}

function restOff(ctx) {
  const l = ctx.ui.editingLook;
  const used = new Set();
  for (const b of l.bindings) {
    if (b.kind === "off" || b.kind === "switch") continue;
    for (const id of ctx.store.expandList(b.entity_ids)) if (id.startsWith("light.")) used.add(id);
  }
  const rest = ctx.store.expandList(ctx.store.managedTargetIds("light"))
    .filter((id) => id.startsWith("light.") && !used.has(id));
  if (!rest.length) { ctx.toast("No remaining light targets."); return; }
  const existing = l.bindings.find((b) => b.kind === "off");
  if (existing) existing.entity_ids = [...new Set(rest)];
  else l.bindings.push({ ...blankBinding(), kind: "off", entity_ids: [...new Set(rest)] });
  ctx.toast(`${rest.length} light${rest.length === 1 ? "" : "s"} set to off.`);
  ctx.renderMain();
}

async function upload(ctx, file) {
  try { ctx.ui.editingLook.img = await ctx.store.uploadImage(file); ctx.toast("Image uploaded."); ctx.renderMain(); }
  catch (err) { ctx.toast(`Upload failed: ${err.message || err}`); }
}

async function save(ctx) {
  const l = ctx.ui.editingLook;
  if (!l.name.trim()) { ctx.toast("Name the look."); return; }
  const bindings = l.bindings.map((b) => {
    const entity_id = b.kind === "switch" ? b.entity_ids.filter((id) => ctx.store.isSwitchTargetId(id)) : ctx.store.expandList(b.entity_ids);
    if (b.kind === "off") return entity_id.length ? { kind: "off", targets: { entity_id } } : null;
    if (b.kind === "switch") return entity_id.length ? { kind: "switch", targets: { entity_id }, action: b.action === "turn_off" ? "turn_off" : "turn_on" } : null;
    if (b.kind === "aqara") return entity_id.length && b.aqara ? { kind: "aqara", targets: { entity_id }, aqara: b.aqara } : null;
    if (b.kind === "effect") return entity_id.length && b.service && b.effect ? { kind: "effect", targets: { entity_id }, service: b.service, data: { effect: b.effect } } : null;
    if (!entity_id.length || !b.scene) return null;
    return { kind: "scene", targets: { entity_id }, scene: b.scene, interval: b.interval === "" ? null : Number(b.interval), transition: b.transition === "" ? null : Number(b.transition) };
  }).filter(Boolean);
  if (!bindings.length) { ctx.toast("Add at least one complete binding."); return; }
  const payload = { name: l.name.trim(), bindings };
  if (l.slug) payload.slug = l.slug;
  if (l.category) payload.category = l.category;
  if (l.img) payload.img = l.img;
  if (l.transition !== "" && l.transition != null) payload.transition = Number(l.transition);
  try { await ctx.store.saveLook(payload); ctx.toast("Look saved."); ctx.ui.editingLook = null; await ctx.refresh(); ctx.navigate("overview"); }
  catch (err) { ctx.toast(`Save failed: ${err.message || err}`); }
}
