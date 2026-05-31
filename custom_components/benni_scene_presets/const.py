DOMAIN = "benni_scene_presets"
NAME = "Benni Scene Presets"

PANEL_URL = "/benni_scene_presets_panel.js"

PLATFORMS = ["switch"]

# Aqara Advanced Lighting bridge: we call AAL's services for `aqara` look
# bindings. Map each "start" service to its matching stop service.
AQARA_DOMAIN = "aqara_advanced_lighting"
AQARA_STOP_SERVICES = {
    "start_dynamic_scene": "stop_dynamic_scene",
    "set_dynamic_effect": "stop_effect",
    "set_segment_pattern": "stop_effect",
    "create_gradient": "stop_effect",
    "create_blocks": "stop_effect",
    "start_cct_sequence": "stop_cct_sequence",
    "start_segment_sequence": "stop_segment_sequence",
}
# Dispatched after looks.json changes so the switch platform can add/remove
# the per-look switch entities at runtime.
SIGNAL_LOOKS_CHANGED = f"{DOMAIN}_looks_changed"

SERVICE_APPLY_PRESET = "apply_preset"
SERVICE_START_DYNAMIC_SCENE = "start_dynamic_scene"
SERVICE_STOP_DYNAMIC_SCENE = "stop_dynamic_scene"
SERVICE_STOP_ALL_DYNAMIC_SCENES = "stop_all_dynamic_scenes"
SERVICE_STOP_DYNAMIC_SCENES_FOR_TARGETS = "stop_dynamic_scenes_for_targets"
SERVICE_GET_DYNAMIC_SCENES = "get_dynamic_scenes"
SERVICE_APPLY_LOOK = "apply_look"
SERVICE_STOP_LOOK = "stop_look"
SERVICE_RESET_USERDATA = "reset_userdata"

# Scene/look identifier on the wire = human name or slug (no UUIDs).
ATTR_SCENE_PRESET_ID = "preset"
ATTR_TARGETS = "targets"
ATTR_BRIGHTNESS = "brightness"
ATTR_TRANSITION = "transition"
ATTR_INITIAL_TRANSITION = "initial_transition"
ATTR_SHUFFLE = "shuffle"
ATTR_SMART_SHUFFLE = "smart_shuffle"
ATTR_INTERVAL = "interval"

ATTR_DYNAMIC_SCENE_ID = "id"
ATTR_LOOK_ID = "look"
