import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import DOMAIN, SIGNAL_LOOKS_CHANGED
from . import file_utils
from .color_conversion import hex_to_xy
from .presets import apply_colors
from .util import ensure_list, resolve_targets


def _resolve_target_entities(hass, targets):
    return resolve_targets(
        hass,
        ensure_list(targets.get("entity_id")),
        ensure_list(targets.get("device_id")),
        ensure_list(targets.get("area_id")),
        ensure_list(targets.get("floor_id")),
        ensure_list(targets.get("label_id")),
    )


def _colors_to_lights(colors):
    """[hex, ...] -> [{hex, x, y}, ...] (server-side RGB->xy)."""
    lights = []
    for hex_value in colors[:10]:
        x, y = hex_to_xy(hex_value)
        lights.append({"hex": hex_value, "x": x, "y": y})
    return lights


def async_setup_websocket_api(hass, dynamic_scene_manager) -> None:
    @websocket_api.websocket_command(
        {
            vol.Required("type"): f"{DOMAIN}/get_dynamic_scenes",
        }
    )
    def ws_get_dynamic_scenes(hass, connection, msg) -> None:
        connection.send_result(msg["id"], dynamic_scene_manager.get_all_as_dict())

    @websocket_api.websocket_command(
        {
            vol.Required("type"): f"{DOMAIN}/list_presets",
        }
    )
    def ws_list_presets(hass, connection, msg) -> None:
        connection.send_result(msg["id"], file_utils.PRESET_DATA)

    @websocket_api.websocket_command(
        {
            vol.Required("type"): f"{DOMAIN}/list_looks",
        }
    )
    def ws_list_looks(hass, connection, msg) -> None:
        connection.send_result(msg["id"], file_utils.list_looks())

    @websocket_api.websocket_command(
        {
            vol.Required("type"): f"{DOMAIN}/save_preset",
            vol.Optional("slug"): str,  # present on edit; kept frozen across renames
            vol.Required("name"): str,
            vol.Optional("category"): vol.Any(str, None),
            vol.Optional("img"): vol.Any(str, None),
            vol.Required("colors"): [str],
            vol.Optional("interval", default=300): vol.Coerce(int),
            vol.Optional("transition", default=60): vol.Coerce(int),
            vol.Optional("shuffle", default=True): bool,
        }
    )
    @websocket_api.require_admin
    @websocket_api.async_response
    async def ws_save_preset(hass, connection, msg) -> None:
        try:
            lights = _colors_to_lights(msg["colors"])
        except ValueError as err:
            connection.send_error(msg["id"], "invalid_color", str(err))
            return

        preset = {
            "name": msg["name"],
            "lights": lights,
            "interval": msg["interval"],
            "transition": msg["transition"],
            "shuffle": msg["shuffle"],
        }
        if msg.get("slug"):
            preset["slug"] = msg["slug"]
        if msg.get("category"):
            preset["category"] = msg["category"]
        if msg.get("img"):
            preset["img"] = msg["img"]

        saved = await hass.async_add_executor_job(file_utils.save_custom_preset, preset)
        connection.send_result(msg["id"], saved)

    @websocket_api.websocket_command(
        {
            vol.Required("type"): f"{DOMAIN}/delete_preset",
            vol.Required("slug"): str,
        }
    )
    @websocket_api.require_admin
    @websocket_api.async_response
    async def ws_delete_preset(hass, connection, msg) -> None:
        removed = await hass.async_add_executor_job(
            file_utils.delete_custom_preset, msg["slug"]
        )
        connection.send_result(msg["id"], {"deleted": removed})

    @websocket_api.websocket_command(
        {
            vol.Required("type"): f"{DOMAIN}/save_look",
            vol.Optional("slug"): str,
            vol.Required("name"): str,
            vol.Required("bindings"): [
                {
                    vol.Optional("kind", default="scene"): str,
                    vol.Required("targets"): dict,
                    vol.Optional("scene"): vol.Any(str, None),
                    vol.Optional("interval"): vol.Any(int, None),
                    vol.Optional("transition"): vol.Any(int, None),
                    # phase B (effect bindings) — accepted/persisted, not executed yet
                    vol.Optional("service"): vol.Any(str, None),
                    vol.Optional("data"): vol.Any(dict, None),
                }
            ],
        }
    )
    @websocket_api.require_admin
    @websocket_api.async_response
    async def ws_save_look(hass, connection, msg) -> None:
        bindings = []
        for b in msg["bindings"]:
            kind = b.get("kind", "scene")
            binding = {"kind": kind, "targets": b["targets"]}
            if kind == "effect":
                if b.get("service"):
                    binding["service"] = b["service"]
                if b.get("data") is not None:
                    binding["data"] = b["data"]
            else:
                binding["scene"] = b.get("scene")
                if b.get("interval") is not None:
                    binding["interval"] = b["interval"]
                if b.get("transition") is not None:
                    binding["transition"] = b["transition"]
            bindings.append(binding)

        look = {"name": msg["name"], "bindings": bindings}
        if msg.get("slug"):
            look["slug"] = msg["slug"]

        saved = await hass.async_add_executor_job(file_utils.save_look, look)
        async_dispatcher_send(hass, SIGNAL_LOOKS_CHANGED)
        connection.send_result(msg["id"], saved)

    @websocket_api.websocket_command(
        {
            vol.Required("type"): f"{DOMAIN}/delete_look",
            vol.Required("slug"): str,
        }
    )
    @websocket_api.require_admin
    @websocket_api.async_response
    async def ws_delete_look(hass, connection, msg) -> None:
        removed = await hass.async_add_executor_job(file_utils.delete_look, msg["slug"])
        async_dispatcher_send(hass, SIGNAL_LOOKS_CHANGED)
        connection.send_result(msg["id"], {"deleted": removed})

    @websocket_api.websocket_command(
        {
            vol.Required("type"): f"{DOMAIN}/apply_preview",
            vol.Required("targets"): dict,
            vol.Optional("colors"): [str],
            vol.Optional("preset"): str,
            vol.Optional("transition", default=2): vol.Coerce(float),
            vol.Optional("brightness", default=200): vol.Coerce(int),
        }
    )
    @websocket_api.require_admin
    @websocket_api.async_response
    async def ws_apply_preview(hass, connection, msg) -> None:
        entity_ids = _resolve_target_entities(hass, msg["targets"])

        if msg.get("colors"):
            try:
                preset_colors = [hex_to_xy(h) for h in msg["colors"]]
            except ValueError as err:
                connection.send_error(msg["id"], "invalid_color", str(err))
                return
        elif msg.get("preset"):
            preset = file_utils.find_preset(msg["preset"])
            preset_colors = [(c["x"], c["y"]) for c in preset["lights"]] if preset else []
        else:
            preset_colors = []

        if entity_ids and preset_colors:
            # shuffle=True so previewing a multi-colour scene on one light shows
            # the whole palette across repeated presses, not just colour #1.
            await apply_colors(
                hass,
                preset_colors,
                entity_ids,
                msg["transition"],
                True,
                False,
                msg["brightness"],
            )
        connection.send_result(msg["id"], {"applied_to": entity_ids})

    websocket_api.async_register_command(hass, ws_get_dynamic_scenes)
    websocket_api.async_register_command(hass, ws_list_presets)
    websocket_api.async_register_command(hass, ws_list_looks)
    websocket_api.async_register_command(hass, ws_save_preset)
    websocket_api.async_register_command(hass, ws_delete_preset)
    websocket_api.async_register_command(hass, ws_save_look)
    websocket_api.async_register_command(hass, ws_delete_look)
    websocket_api.async_register_command(hass, ws_apply_preview)
