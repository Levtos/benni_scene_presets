import voluptuous as vol
import homeassistant.helpers.config_validation as cv
import logging
from homeassistant.core import HomeAssistant, SupportsResponse
from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers.dispatcher import async_dispatcher_send
from .const import *

from .dynamic_scenes import DynamicScene, DynamicSceneManager
from .presets import apply_preset
from .view import async_setup_view, async_remove_view
from .util import ensure_list, resolve_targets
from .websocket_api import async_setup_websocket_api
from . import file_utils

CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)

APPLY_PRESET_SCHEMA = vol.Schema({
    vol.Required(ATTR_SCENE_PRESET_ID): cv.string,
    vol.Required(ATTR_TARGETS): vol.Any(dict),
    vol.Optional(ATTR_BRIGHTNESS): vol.Coerce(int),
    vol.Optional(ATTR_TRANSITION, default=1): vol.Coerce(int),
    vol.Optional(ATTR_SHUFFLE, default=False): cv.boolean,
    vol.Optional(ATTR_SMART_SHUFFLE, default=False): cv.boolean
})

START_DYNAMIC_SCENE_SCHEMA = vol.Schema({
    vol.Required(ATTR_SCENE_PRESET_ID): cv.string,
    vol.Required(ATTR_TARGETS): vol.Any(dict),
    vol.Optional(ATTR_INTERVAL, default=60): vol.Coerce(int),
    vol.Optional(ATTR_BRIGHTNESS): vol.Coerce(int),
    vol.Optional(ATTR_TRANSITION, default=1): vol.Coerce(int),
    # Transition for the very first paint. If omitted, the requested transition
    # is used (smooth crossfade) instead of the upstream hard-coded 0.5s snap.
    # Set to 0.5 to restore the original behaviour.
    vol.Optional(ATTR_INITIAL_TRANSITION): vol.Coerce(float),
})

STOP_DYNAMIC_SCENE_SCHEMA = vol.Schema({
    vol.Required(ATTR_DYNAMIC_SCENE_ID): cv.string,
})

STOP_DYNAMIC_SCENES_FOR_TARGETS_SCHEMA = vol.Schema({
    vol.Required(ATTR_TARGETS): vol.Any(dict),
})

APPLY_LOOK_SCHEMA = vol.Schema({
    vol.Required(ATTR_LOOK_ID): cv.string,
    # Brightness override (typically supplied by the light policy / day phase).
    vol.Optional(ATTR_BRIGHTNESS): vol.Coerce(int),
})

STOP_LOOK_SCHEMA = vol.Schema({
    vol.Required(ATTR_LOOK_ID): cv.string,
})

RESET_USERDATA_SCHEMA = vol.Schema({
    vol.Optional("delete_images", default=True): cv.boolean,
})


_LOGGER = logging.getLogger(__name__)

dynamic_scene_manager = DynamicSceneManager()


async def async_setup(hass, config):
    async def apply_preset_service(call):
        preset_id = call.data.get(ATTR_SCENE_PRESET_ID)
        brightness_override = call.data.get(ATTR_BRIGHTNESS)
        transition = call.data.get(ATTR_TRANSITION, 1)
        shuffle = call.data.get(ATTR_SHUFFLE, False)
        smart_shuffle = call.data.get(ATTR_SMART_SHUFFLE, False)

        light_entity_ids = _resolve(call.data.get(ATTR_TARGETS))

        await apply_preset(
            hass,
            preset_id,
            light_entity_ids,
            transition,
            shuffle,
            smart_shuffle,
            brightness_override
        )


    def _resolve(targets):
        return resolve_targets(
            hass,
            ensure_list(targets.get("entity_id")),
            ensure_list(targets.get("device_id")),
            ensure_list(targets.get("area_id")),
            ensure_list(targets.get("floor_id")),
            ensure_list(targets.get("label_id")),
        )

    def _start_scene(preset_ident, light_entity_ids, interval, brightness, transition, initial_transition, look=None):
        # always stop any existing actions on these lights first
        for light_entity_id in light_entity_ids:
            dynamic_scene_manager.stop_all_for_entity_id(light_entity_id)

        return dynamic_scene_manager.create_new(
            hass,
            {
                "light_entity_ids": light_entity_ids,
                ATTR_SCENE_PRESET_ID: preset_ident,
                ATTR_BRIGHTNESS: brightness,
                ATTR_TRANSITION: transition,
                ATTR_INITIAL_TRANSITION: initial_transition,
                ATTR_SHUFFLE: True,
                "look": look,  # slug of the look this scene belongs to (for the look switch)
            },
            interval
        )

    async def start_dynamic_scene(call):
        light_entity_ids = _resolve(call.data.get(ATTR_TARGETS))

        return _start_scene(
            call.data.get(ATTR_SCENE_PRESET_ID),
            light_entity_ids,
            call.data.get(ATTR_INTERVAL),
            call.data.get(ATTR_BRIGHTNESS),
            call.data.get(ATTR_TRANSITION, 1),
            call.data.get(ATTR_INITIAL_TRANSITION),
        )

    async def apply_look(call):
        look_ident = call.data.get(ATTR_LOOK_ID)
        brightness = call.data.get(ATTR_BRIGHTNESS)

        look = file_utils.get_look(look_ident)
        if not look:
            raise vol.Invalid(f"Look '{look_ident}' not found.")

        look_slug = look.get("slug")
        dynamic_scene_manager.mark_look_active(look_slug)
        started = []
        for binding in look.get("bindings", []):
            kind = binding.get("kind", "scene")

            if kind == "aqara":
                # Named Aqara preset → call its AAL service on the targets.
                aqara = file_utils.get_aqara(binding.get("aqara"))
                raw_targets = ensure_list((binding.get("targets") or {}).get("entity_id"))
                if aqara and aqara.get("service") and raw_targets:
                    data = dict(aqara.get("data") or {})
                    data["entity_id"] = raw_targets
                    # Make the effect fire even if the light was off (only
                    # set_dynamic_effect accepts turn_on; don't add it to others).
                    if aqara["service"] == "set_dynamic_effect":
                        data.setdefault("turn_on", True)
                    hass.async_create_task(
                        hass.services.async_call(AQARA_DOMAIN, aqara["service"], data, blocking=False)
                    )
                continue

            if kind == "effect":
                # Generic service binding (raw service + data — fallback/advanced).
                # Pass the configured targets straight through (not light-only
                # resolved) so non-light services work.
                service = binding.get("service")
                raw_targets = ensure_list((binding.get("targets") or {}).get("entity_id"))
                if service and "." in service and raw_targets:
                    domain, svc = service.split(".", 1)
                    data = dict(binding.get("data") or {})
                    data["entity_id"] = raw_targets
                    hass.async_create_task(
                        hass.services.async_call(domain, svc, data, blocking=False)
                    )
                continue

            light_entity_ids = _resolve(binding.get("targets", {}))
            if not light_entity_ids:
                continue

            scene_ident = binding.get("scene") or binding.get("scene_id")
            if not scene_ident:
                continue

            interval = binding.get("interval")
            transition = binding.get("transition")
            if interval is None or transition is None:
                preset = file_utils.find_preset(scene_ident)
                if preset:
                    if interval is None:
                        interval = preset.get("interval", 60)
                    if transition is None:
                        transition = preset.get("transition", 1)

            started.append(_start_scene(
                scene_ident,
                light_entity_ids,
                interval if interval is not None else 60,
                brightness,
                transition if transition is not None else 1,
                None,
                look_slug,
            ))

        return {"dynamic_scenes": started}

    async def stop_look(call):
        look = file_utils.get_look(call.data.get(ATTR_LOOK_ID))
        if not look:
            return

        dynamic_scene_manager.mark_look_inactive(look.get("slug"))
        effect_off = []
        for binding in look.get("bindings", []):
            kind = binding.get("kind")
            if kind == "aqara":
                aqara = file_utils.get_aqara(binding.get("aqara"))
                raw_targets = ensure_list((binding.get("targets") or {}).get("entity_id"))
                if raw_targets:
                    stop_svc = AQARA_STOP_SERVICES.get((aqara or {}).get("service"), "stop_dynamic_scene")
                    hass.async_create_task(
                        hass.services.async_call(AQARA_DOMAIN, stop_svc, {"entity_id": raw_targets}, blocking=False)
                    )
            elif kind == "effect":
                # Best-effort: turn the effect targets (e.g. the RGB ring) off.
                effect_off += _resolve(binding.get("targets", {}))
            else:
                for light_entity_id in _resolve(binding.get("targets", {})):
                    dynamic_scene_manager.stop_all_for_entity_id(light_entity_id)

        if effect_off:
            hass.async_create_task(
                hass.services.async_call("light", "turn_off", {"entity_id": effect_off}, blocking=False)
            )

    async def reset_userdata(call):
        # Stop everything, wipe custom scenes + looks, drop the look switches.
        dynamic_scene_manager.stop_all()
        counts = await hass.async_add_executor_job(
            file_utils.reset_userdata, call.data.get("delete_images", True)
        )
        async_dispatcher_send(hass, SIGNAL_LOOKS_CHANGED)
        return counts

    async def stop_dynamic_scene(call):
        scene_id = call.data.get(ATTR_DYNAMIC_SCENE_ID)

        dynamic_scene_manager.delete_by_id(scene_id)

    async def stop_dynamic_scenes_for_targets(call):
        for light_entity_id in _resolve(call.data.get(ATTR_TARGETS)):
            dynamic_scene_manager.stop_all_for_entity_id(light_entity_id)

        return True

    async def stop_all_dynamic_scenes(call):
        dynamic_scene_manager.stop_all()

    async def get_dynamic_scenes(call):
        return dynamic_scene_manager.get_all_as_dict()


    hass.services.async_register(
        DOMAIN,
        SERVICE_APPLY_PRESET,
        apply_preset_service,
        schema=APPLY_PRESET_SCHEMA,
    )

    hass.services.async_register(
        DOMAIN,
        SERVICE_GET_DYNAMIC_SCENES,
        get_dynamic_scenes,
        supports_response=SupportsResponse.ONLY
    )

    hass.services.async_register(
        DOMAIN,
        SERVICE_START_DYNAMIC_SCENE,
        start_dynamic_scene,
        schema=START_DYNAMIC_SCENE_SCHEMA,
        supports_response=SupportsResponse.OPTIONAL
    )

    hass.services.async_register(
        DOMAIN,
        SERVICE_STOP_DYNAMIC_SCENE,
        stop_dynamic_scene,
        schema=STOP_DYNAMIC_SCENE_SCHEMA
    )

    hass.services.async_register(
        DOMAIN,
        SERVICE_STOP_DYNAMIC_SCENES_FOR_TARGETS,
        stop_dynamic_scenes_for_targets,
        schema=STOP_DYNAMIC_SCENES_FOR_TARGETS_SCHEMA
    )

    hass.services.async_register(
        DOMAIN,
        SERVICE_STOP_ALL_DYNAMIC_SCENES,
        stop_all_dynamic_scenes,
    )

    hass.services.async_register(
        DOMAIN,
        SERVICE_APPLY_LOOK,
        apply_look,
        schema=APPLY_LOOK_SCHEMA,
        supports_response=SupportsResponse.OPTIONAL
    )

    hass.services.async_register(
        DOMAIN,
        SERVICE_STOP_LOOK,
        stop_look,
        schema=STOP_LOOK_SCHEMA
    )

    hass.services.async_register(
        DOMAIN,
        SERVICE_RESET_USERDATA,
        reset_userdata,
        schema=RESET_USERDATA_SCHEMA,
        supports_response=SupportsResponse.OPTIONAL
    )


    return True

async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry
) -> bool:
    hass.data.setdefault(DOMAIN, {})

    await async_setup_view(hass)

    async_setup_websocket_api(hass, dynamic_scene_manager)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    return True

async def async_unload_entry(
    hass: HomeAssistant, entry: ConfigEntry
) -> bool:
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)

async def async_remove_entry(
    hass: HomeAssistant, entry: ConfigEntry
) -> None:

    await async_remove_view(hass)