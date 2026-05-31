import voluptuous as vol
import homeassistant.helpers.config_validation as cv
import logging
from homeassistant.core import HomeAssistant, SupportsResponse
from homeassistant.config_entries import ConfigEntry
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


_LOGGER = logging.getLogger(__name__)

dynamic_scene_manager = DynamicSceneManager()


async def async_setup(hass, config):
    async def apply_preset_service(call):
        preset_id = call.data.get(ATTR_SCENE_PRESET_ID)
        targets = call.data.get(ATTR_TARGETS)
        brightness_override = call.data.get(ATTR_BRIGHTNESS)
        transition = call.data.get(ATTR_TRANSITION, 1)
        shuffle = call.data.get(ATTR_SHUFFLE, False)
        smart_shuffle = call.data.get(ATTR_SMART_SHUFFLE, False)

        entity_ids = ensure_list(targets.get("entity_id"))
        device_ids = ensure_list(targets.get("device_id"))
        area_ids = ensure_list(targets.get("area_id"))
        floor_ids = ensure_list(targets.get("floor_id"))
        label_ids = ensure_list(targets.get("label_id"))


        light_entity_ids = resolve_targets(hass, entity_ids, device_ids, area_ids, floor_ids, label_ids)

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

    def _start_scene(preset_id, light_entity_ids, interval, brightness, transition, initial_transition):
        # always stop any existing actions on these lights first
        for light_entity_id in light_entity_ids:
            dynamic_scene_manager.stop_all_for_entity_id(light_entity_id)

        return dynamic_scene_manager.create_new(
            hass,
            {
                "preset_id": preset_id,
                "light_entity_ids": light_entity_ids,
                "brightness": brightness,
                "transition": transition,
                "initial_transition": initial_transition,
                "shuffle": True,
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
        look_id = call.data.get(ATTR_LOOK_ID)
        brightness = call.data.get(ATTR_BRIGHTNESS)

        look = file_utils.get_look(look_id)
        if not look:
            raise vol.Invalid(f"Look '{look_id}' not found.")

        started = []
        for binding in look.get("bindings", []):
            scene_id = binding.get("scene_id")
            light_entity_ids = _resolve(binding.get("targets", {}))
            if not scene_id or not light_entity_ids:
                continue

            interval = binding.get("interval")
            transition = binding.get("transition")
            if interval is None or transition is None:
                preset = next(
                    (p for p in file_utils.PRESET_DATA.get("presets", []) if p.get("id") == scene_id),
                    None,
                )
                if preset:
                    if interval is None:
                        interval = preset.get("interval", 60)
                    if transition is None:
                        transition = preset.get("transition", 1)

            started.append(_start_scene(
                scene_id,
                light_entity_ids,
                interval if interval is not None else 60,
                brightness,
                transition if transition is not None else 1,
                None,
            ))

        return {"dynamic_scenes": started}

    async def stop_look(call):
        look = file_utils.get_look(call.data.get(ATTR_LOOK_ID))
        if not look:
            return

        for binding in look.get("bindings", []):
            for light_entity_id in _resolve(binding.get("targets", {})):
                dynamic_scene_manager.stop_all_for_entity_id(light_entity_id)

    async def stop_dynamic_scene(call):
        scene_id = call.data.get(ATTR_DYNAMIC_SCENE_ID)

        dynamic_scene_manager.delete_by_id(scene_id)

    async def stop_dynamic_scenes_for_targets(call):
        targets = call.data.get(ATTR_TARGETS)

        entity_ids = ensure_list(targets.get("entity_id"))
        device_ids = ensure_list(targets.get("device_id"))
        area_ids = ensure_list(targets.get("area_id"))
        floor_ids = ensure_list(targets.get("floor_id"))
        label_ids = ensure_list(targets.get("label_id"))

        light_entity_ids = resolve_targets(hass, entity_ids, device_ids, area_ids, floor_ids, label_ids)

        for light_entity_id in light_entity_ids:
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


    return True

async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry
) -> bool:
    hass.data.setdefault(DOMAIN, {})

    await async_setup_view(hass)

    async_setup_websocket_api(hass, dynamic_scene_manager)

    return True

async def async_remove_entry(
    hass: HomeAssistant, entry: ConfigEntry
) -> None:

    await async_remove_view(hass)