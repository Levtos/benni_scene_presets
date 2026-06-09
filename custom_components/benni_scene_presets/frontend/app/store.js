// Data layer for the modular panel: wraps the benni_scene_presets/* WS commands,
// caches the libraries, and derives the capability / coverage facts the views
// need. Framework-free; one instance per panel, fed the live `hass` object.

export const DOMAIN = "benni_scene_presets";
export const AQARA_DOMAIN = "aqara_advanced_lighting";
export const MAX_STOPS = 10;
// HA light colour modes that count as "can show a colour" (vs color_temp only).
const COLOR_MODES = ["xy", "hs", "rgb", "rgbw", "rgbww"];

export const slugify = (name) =>
  ((name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")) || "item";
export const esc = (s) =>
  s == null ? "" : String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Kelvin -> #rrggbb (Tanner Helland approximation), only for swatches/gradients.
export const kelvinToHex = (kelvin) => {
  const k = Math.min(40000, Math.max(1000, kelvin)) / 100;
  const bound = (v) => Math.min(255, Math.max(0, v));
  const r = k <= 66 ? 255 : bound(329.698727446 * Math.pow(k - 60, -0.1332047592));
  const g = k <= 66 ? bound(99.4708025861 * Math.log(k) - 161.1195681661)
                    : bound(288.1221695283 * Math.pow(k - 60, -0.0755148492));
  const b = k >= 66 ? 255 : k <= 19 ? 0 : bound(138.5177312231 * Math.log(k - 10) - 305.0447927307);
  const h = (v) => Math.round(v).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
};

export class Store {
  constructor() {
    this.hass = null;
    this.presets = [];   // custom scenes (RGB + Kelvin, split in the UI by `kelvins`)
    this.looks = [];
    this.aqara = [];
    this.categoryList = [];
    this.targetConfig = { configured: false, lights: [], switches: [] };
    this.dynamic = [];    // running dynamic scenes
  }

  setHass(hass) { this.hass = hass; }

  async refresh() {
    const h = this.hass;
    try {
      const d = await h.callWS({ type: `${DOMAIN}/list_presets` });
      this.presets = (d.presets || []).filter((p) => p.custom);
      this.categoryList = (d.categories || []).map((c) => typeof c === "string" ? c : c.name).filter(Boolean);
      if (d.targets) this.targetConfig = this._normalizeTargetConfig(d.targets);
    } catch { this.presets = []; this.categoryList = []; }
    try {
      const d = await h.callWS({ type: `${DOMAIN}/list_categories` });
      this.categoryList = (d.categories || []).map((c) => typeof c === "string" ? c : c.name).filter(Boolean);
    } catch {}
    try {
      const d = await h.callWS({ type: `${DOMAIN}/list_targets` });
      this.targetConfig = this._normalizeTargetConfig(d.targets);
    } catch {}
    try { const d = await h.callWS({ type: `${DOMAIN}/list_looks` }); this.looks = d.looks || []; } catch { this.looks = []; }
    try { const d = await h.callWS({ type: `${DOMAIN}/list_aqara` }); this.aqara = d.aqara || []; } catch { this.aqara = []; }
    try { const d = await h.callWS({ type: `${DOMAIN}/get_dynamic_scenes` }); this.dynamic = d.dynamic_scenes || []; } catch { this.dynamic = []; }
  }

  // --- scene classification ---
  presetKelvins(p) {
    if (p && p.kelvins && p.kelvins.length) return p.kelvins;
    if (p && p.kelvin != null) return [p.kelvin];
    return null;
  }
  isKelvinScene(p) { return this.presetKelvins(p) != null; }
  rgbScenes() { return this.presets.filter((p) => !this.isKelvinScene(p)); }
  kelvinScenes() { return this.presets.filter((p) => this.isKelvinScene(p)); }
  findPreset(slug) { return this.presets.find((p) => p.slug === slug || p.name === slug); }
  findAqara(slug) { return this.aqara.find((a) => a.slug === slug || a.name === slug); }
  categories(list) {
    const managed = this.categoryList || [];
    const assigned = (list || [...this.presets, ...this.looks, ...this.aqara]).map((p) => p.category).filter(Boolean);
    return [...new Set([...managed, ...assigned])].sort((a, b) => a.localeCompare(b));
  }
  categoryOptions(current) {
    const categories = this.categories();
    if (current && !categories.includes(current)) categories.push(current);
    return categories.sort((a, b) => a.localeCompare(b));
  }
  _normalizeTargetConfig(targets) {
    const t = targets || {};
    return {
      configured: !!t.configured,
      lights: [...new Set((t.lights || []).filter((id) => this.isLightTargetId(id)))],
      switches: [...new Set((t.switches || []).filter((id) => id && id.startsWith("switch.")))],
    };
  }

  // A scene with more than one value runs as a dynamic loop; a single value paints once.
  isDynamicScene(p) {
    const kl = this.presetKelvins(p);
    if (kl) return kl.length > 1;
    return (p.lights || []).length > 1;
  }
  // Looks referencing a given scene slug — for "Used in Looks".
  looksUsingScene(slug) { return this.looks.filter((l) => (l.bindings || []).some((b) => b.scene === slug)); }
  looksUsingAqara(slug) { return this.looks.filter((l) => (l.bindings || []).some((b) => b.aqara === slug)); }

  // --- capability detection from supported_color_modes ---
  lightModes(id) {
    const st = this.hass.states && this.hass.states[id];
    return (st && st.attributes && st.attributes.supported_color_modes) || [];
  }
  hasColor(id) { return this.lightModes(id).some((m) => COLOR_MODES.includes(m)); }
  hasCCT(id) { return this.lightModes(id).includes("color_temp"); }
  capLabel(id) {
    const rgb = this.hasColor(id), cct = this.hasCCT(id);
    return rgb && cct ? "RGB+CCT" : rgb ? "RGB" : cct ? "CCT" : "";
  }
  friendly(id) {
    const st = this.hass.states && this.hass.states[id];
    return (st && st.attributes && st.attributes.friendly_name) || id;
  }
  area(id) {
    // HA exposes area via entity registry; fall back to "Ungrouped" if unknown.
    const ent = this.hass.entities && this.hass.entities[id];
    const areaId = ent && ent.area_id;
    if (areaId && this.hass.areas && this.hass.areas[areaId]) return this.hass.areas[areaId].name;
    // device -> area fallback
    if (ent && ent.device_id && this.hass.devices && this.hass.devices[ent.device_id]) {
      const dev = this.hass.devices[ent.device_id];
      if (dev.area_id && this.hass.areas && this.hass.areas[dev.area_id]) return this.hass.areas[dev.area_id].name;
    }
    return "Ungrouped";
  }

  groupMembers(id) {
    const st = this.hass.states && this.hass.states[id];
    const m = st && st.attributes && st.attributes.entity_id;
    return m ? [].concat(m) : [];
  }
  // Expand groups / benni light-group sensors to their member light entities.
  expandList(ids) {
    const states = this.hass.states || {};
    const out = [];
    for (const id of ids || []) {
      if (id && (id.startsWith("group.") || id.startsWith("sensor.benni_light_group_"))) {
        const m = states[id] && states[id].attributes && states[id].attributes.entity_id;
        if (m) out.push(...[].concat(m));
      } else if (id) out.push(id);
    }
    return [...new Set(out)];
  }

  isLightTargetId(id) {
    return !!id && (id.startsWith("light.") || id.startsWith("group.") || id.startsWith("sensor.benni_light_group_"));
  }
  isSwitchTargetId(id) { return !!id && id.startsWith("switch."); }
  autoLightTargetIds() {
    const states = this.hass.states || {};
    return Object.keys(states)
      .filter((id) => this.isLightTargetId(id))
      .sort();
  }
  autoSwitchTargetIds() {
    const states = this.hass.states || {};
    return Object.keys(states)
      .filter((id) => this.isSwitchTargetId(id))
      .sort();
  }
  managedTargetIds(kind) {
    if (kind === "switch") {
      return this.targetConfig.configured ? this.targetConfig.switches : this.autoSwitchTargetIds();
    }
    return this.targetConfig.configured ? this.targetConfig.lights : this.autoLightTargetIds();
  }
  targetConfigCount(kind) {
    return this.managedTargetIds(kind).length;
  }
  availableTargetEntities(kind) {
    const ids = kind === "switch" ? this.autoSwitchTargetIds() : this.autoLightTargetIds();
    return ids.map((id) => this.targetEntry(id, kind === "switch"));
  }
  targetEntry(id, isSwitch = false) {
    const group = !isSwitch && (id.startsWith("group.") || id.startsWith("sensor.benni_light_group_"));
    return {
      id,
      label: this.friendly(id),
      group,
      cap: isSwitch ? "Switch" : (group ? "group" : this.capLabel(id)),
      area: group ? "Groups" : this.area(id),
    };
  }

  // capability mode: "white" = CCT-only, "color" = has a colour mode, "all" = any.
  lightPasses(id, mode) {
    if (mode === "white") return this.hasCCT(id) && !this.hasColor(id);
    if (mode === "color") return this.hasColor(id);
    return true;
  }
  groupPasses(id, mode) {
    if (mode === "all") return true;
    const members = this.groupMembers(id).filter((m) => m.startsWith("light."));
    return members.length > 0 && members.every((m) => this.lightPasses(m, mode));
  }
  // Lights/groups offered to a picker, filtered by capability mode.
  targetEntities(mode = "all") {
    if (mode === "switch" || mode === "switch_config") {
      const ids = mode === "switch_config" ? this.autoSwitchTargetIds() : this.managedTargetIds("switch");
      return { groups: [], lights: ids.map((id) => this.targetEntry(id, true)) };
    }
    const ids = mode === "light_config" ? this.autoLightTargetIds() : this.managedTargetIds("light");
    const groups = ids
      .filter((id) => (id.startsWith("group.") || id.startsWith("sensor.benni_light_group_")) && this.groupPasses(id, mode))
      .sort().map((id) => this.targetEntry(id));
    const lights = ids
      .filter((id) => id.startsWith("light.") && this.lightPasses(id, mode))
      .sort().map((id) => this.targetEntry(id));
    return { groups, lights };
  }
  // Capability mode a scene binding wants, derived from the bound scene.
  sceneTargetMode(slug) {
    const p = this.findPreset(slug);
    if (!p) return "all";
    return this.isKelvinScene(p) ? "white" : "color";
  }

  // --- running state ---
  isLookRunning(slug) {
    const st = this.hass.states && this.hass.states[`switch.benni_look_${slug}`];
    return !!(st && st.state === "on");
  }
  anyRunning() {
    return (this.dynamic || []).length > 0 || this.looks.some((l) => this.isLookRunning(l.slug));
  }

  // --- per-binding capability kind, for capability summary chips ---
  bindingKind(b) {
    const k = b.kind || "scene";
    if (k === "off") return "off";
    if (k === "switch") return "switch";
    if (k === "aqara") return "aqara";
    if (k === "effect") return "raw";
    const p = this.findPreset(b.scene || b.scene_id);
    return p && this.isKelvinScene(p) ? "cct" : "rgb";
  }

  // --- coverage + validation for a Look (detail panel + composer panel) ---
  lookInfo(look) {
    const bindings = look.bindings || [];
    const seen = new Map();
    const caps = { rgb: 0, cct: 0, rgbcct: 0, off: 0, aqara: 0, raw: 0, switch: 0 };
    let unsupported = 0;
    const allLights = new Set();
    const allSwitches = new Set();

    for (const b of bindings) {
      const kind = this.bindingKind(b);
      caps[kind] = (caps[kind] || 0) + 1;
      const rawTargets = (b.targets && [].concat(b.targets.entity_id || [])) || (b.entity_ids || []);
      const targets = kind === "switch" ? rawTargets : this.expandList(rawTargets);
      for (const id of targets) {
        if (id.startsWith("switch.")) {
          allSwitches.add(id);
          seen.set(id, (seen.get(id) || 0) + 1);
          continue;
        }
        if (!id.startsWith("light.")) continue;
        allLights.add(id);
        seen.set(id, (seen.get(id) || 0) + 1);
        if (kind === "rgb" && !this.hasColor(id)) unsupported++;
        else if (kind === "cct" && !this.hasCCT(id) && !this.hasColor(id)) unsupported++;
      }
    }
    const duplicates = [...seen.values()].filter((n) => n > 1).length;
    let status = "ready";
    if (this.isLookRunning(look.slug)) status = "playing";
    else if (!bindings.length || duplicates || unsupported) status = "warning";

    return {
      bindingCount: bindings.length,
      lightCount: allLights.size,
      switchCount: allSwitches.size,
      duplicates, unsupported, caps, status,
      checks: {
        noDuplicates: duplicates === 0,
        allSupported: unsupported === 0,
        hasBindings: bindings.length > 0,
      },
    };
  }

  // --- service / WS actions ---
  applyLook(slug, brightness) {
    const data = { look: slug };
    if (brightness != null) data.brightness = Number(brightness);
    return this.hass.callService(DOMAIN, "apply_look", data);
  }
  stopLook(slug) { return this.hass.callService(DOMAIN, "stop_look", { look: slug }); }
  stopAll() { return this.hass.callService(DOMAIN, "stop_all_dynamic_scenes", {}); }

  controlledLights() {
    const lights = new Set();
    for (const d of this.dynamic || []) {
      for (const id of (d.parameters && d.parameters.light_entity_ids) || []) lights.add(id);
    }
    for (const l of this.looks) {
      if (!this.isLookRunning(l.slug)) continue;
      for (const b of l.bindings || []) {
        for (const id of this.expandList([].concat((b.targets && b.targets.entity_id) || []))) lights.add(id);
      }
    }
    return [...lights].filter((id) => id.startsWith("light."));
  }
  async offAll() {
    const lights = this.controlledLights();
    await this.stopAll();
    for (const l of this.looks) if (this.isLookRunning(l.slug)) await this.stopLook(l.slug);
    if (lights.length) await this.hass.callService("light", "turn_off", { entity_id: lights });
    return lights.length;
  }

  // Preview a scene/colours/kelvin on the given lights (no persistence).
  applyPreview({ entity_id, colors, kelvin, transition = 1, brightness }) {
    const msg = { type: `${DOMAIN}/apply_preview`, targets: { entity_id }, transition };
    if (colors) msg.colors = colors;
    if (kelvin != null) msg.kelvin = Number(kelvin);
    if (brightness != null) msg.brightness = Number(brightness);
    return this.hass.callWS(msg);
  }

  // --- CRUD ---
  savePreset(payload) { return this.hass.callWS({ type: `${DOMAIN}/save_preset`, ...payload }); }
  deletePreset(slug) { return this.hass.callWS({ type: `${DOMAIN}/delete_preset`, slug }); }
  saveLook(payload) { return this.hass.callWS({ type: `${DOMAIN}/save_look`, ...payload }); }
  deleteLook(slug) { return this.hass.callWS({ type: `${DOMAIN}/delete_look`, slug }); }
  saveAqara(payload) { return this.hass.callWS({ type: `${DOMAIN}/save_aqara`, ...payload }); }
  deleteAqara(slug) { return this.hass.callWS({ type: `${DOMAIN}/delete_aqara`, slug }); }
  saveCategories(categories) { return this.hass.callWS({ type: `${DOMAIN}/save_categories`, categories }); }
  saveTargets(targets) { return this.hass.callWS({ type: `${DOMAIN}/save_targets`, targets }); }

  // Aqara preset options read live from the AAL service schema (if installed).
  aqaraPresetOptions(service) {
    try {
      const o = this.hass.services[AQARA_DOMAIN][service].fields.preset.selector.select.options;
      return (o || []).map((x) => (typeof x === "string" ? { value: x, label: x } : x));
    } catch { return []; }
  }

  async uploadImage(file) {
    const form = new FormData(); form.append("file", file);
    const resp = await fetch(`/api/${DOMAIN}/upload_image`, {
      method: "POST", body: form,
      headers: { Authorization: `Bearer ${this.hass.auth.data.access_token}` },
    });
    if (!resp.ok) throw new Error(await resp.text());
    return (await resp.json()).img;
  }
}
