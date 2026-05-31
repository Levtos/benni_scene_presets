import uuid
import voluptuous as vol
from homeassistant.components import websocket_api

from .const import DOMAIN
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
            vol.Required("type"): f"{DOMAIN}/save_preset",
            vol.Optional("preset_id"): str,
            vol.Required("name"): str,
            vol.Optional("img"): vol.Any(str, None),
            vol.Required("colors"): [str],
            vol.Optional("interval", default=300): vol.Coerce(int),
            vol.Optional("transition", default=60): vol.Coerce(int),
            vol.Optional("shuffle", default=True): bool,
            vol.Optional("category"): vol.Any(str, None),
        }
    )
    @websocket_api.require_admin
    @websocket_api.async_response
    async def ws_save_preset(hass, connection, msg) -> None:
        colors = msg["colors"][:10]
        try:
            lights = []
            for h in colors:
                x, y = hex_to_xy(h)
                lights.append({"hex": h, "x": x, "y": y})
        except ValueError as err:
            connection.send_error(msg["id"], "invalid_color", str(err))
            return

        preset = {
            "id": msg.get("preset_id") or str(uuid.uuid4()),
            "name": msg["name"],
            "lights": lights,
            "interval": msg["interval"],
            "transition": msg["transition"],
            "shuffle": msg["shuffle"],
        }
        if msg.get("img"):
            preset["img"] = msg["img"]
        if msg.get("category"):
            preset["category"] = msg["category"]

        saved = await hass.async_add_executor_job(file_utils.save_custom_preset, preset)
        connection.send_result(msg["id"], saved)

    @websocket_api.websocket_command(
        {
            vol.Required("type"): f"{DOMAIN}/delete_preset",
            vol.Required("preset_id"): str,
        }
    )
    @websocket_api.require_admin
    @websocket_api.async_response
    async def ws_delete_preset(hass, connection, msg) -> None:
        removed = await hass.async_add_executor_job(
            file_utils.delete_custom_preset, msg["preset_id"]
        )
        connection.send_result(msg["id"], {"deleted": removed})

    @websocket_api.websocket_command(
        {
            vol.Required("type"): f"{DOMAIN}/apply_preview",
            vol.Required("targets"): dict,
            vol.Optional("colors"): [str],
            vol.Optional("preset_id"): str,
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
        elif msg.get("preset_id"):
            preset = next(
                (p for p in file_utils.PRESET_DATA.get("presets", []) if p.get("id") == msg["preset_id"]),
                None,
            )
            preset_colors = [(c["x"], c["y"]) for c in preset["lights"]] if preset else []
        else:
            preset_colors = []

        if entity_ids and preset_colors:
            await apply_colors(
                hass,
                preset_colors,
                entity_ids,
                msg["transition"],
                False,
                False,
                msg["brightness"],
            )
        connection.send_result(msg["id"], {"applied_to": entity_ids})

    websocket_api.async_register_command(hass, ws_get_dynamic_scenes)
    websocket_api.async_register_command(hass, ws_list_presets)
    websocket_api.async_register_command(hass, ws_save_preset)
    websocket_api.async_register_command(hass, ws_delete_preset)
    websocket_api.async_register_command(hass, ws_apply_preview)
