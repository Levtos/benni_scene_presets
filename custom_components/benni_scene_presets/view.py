import os
import uuid
from .const import NAME, DOMAIN, PANEL_URL
from .file_utils import VERSION, PRESET_DATA, BASE_PATH, CUSTOM_ASSETS_DIR
from homeassistant.components.http import HomeAssistantView, StaticPathConfig
from homeassistant.components.frontend import async_remove_panel, async_register_built_in_panel

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

# Adapted from https://github.com/hacs/integration/blob/7d46a52de0df2466aa65e446458b952150398f4c/custom_components/hacs/frontend.py#L58
try:
    from homeassistant.components.frontend import add_extra_js_url
except ImportError:
    def add_extra_js_url(hass: HomeAssistant, url: str, es5: bool = False) -> None:
        if "frontend_extra_module_url" not in hass.data:
            hass.data["frontend_extra_module_url"] = set()
        hass.data["frontend_extra_module_url"].add(url)

class ScenePresetDataView(HomeAssistantView):
    url = f'/assets/{DOMAIN}/preset_data.json'
    name = f'assets:{DOMAIN}:preset_data'
    requires_auth = False

    async def get(self, request):
        return self.json(
            result=PRESET_DATA,
        )


class ScenePresetImageUploadView(HomeAssistantView):
    url = f'/api/{DOMAIN}/upload_image'
    name = f'api:{DOMAIN}:upload_image'
    requires_auth = True

    async def post(self, request):
        hass_user = request.get("hass_user")
        if hass_user is None or not hass_user.is_admin:
            return self.json_message("Admin required", status_code=401)

        data = await request.post()
        field = data.get("file")
        if field is None or not hasattr(field, "filename"):
            return self.json_message("No file provided", status_code=400)

        ext = os.path.splitext(field.filename or "")[1].lower()
        if ext not in ALLOWED_IMAGE_EXTENSIONS:
            return self.json_message(f"Unsupported file type: {ext}", status_code=400)

        filename = f"{uuid.uuid4()}{ext}"
        target = os.path.join(CUSTOM_ASSETS_DIR, filename)

        hass = request.app["hass"]

        def _write():
            os.makedirs(CUSTOM_ASSETS_DIR, exist_ok=True)
            with open(target, "wb") as out:
                out.write(field.file.read())

        await hass.async_add_executor_job(_write)
        await async_register_custom_image(hass, filename)

        return self.json({"img": filename})

def _cache_bust():
    # The manifest version is static (0.1.0) across branch updates, so it can't
    # bust the browser cache. Use the panel file's mtime instead — it changes on
    # every HACS download, forcing the browser to fetch the current panel JS.
    try:
        return str(int(os.path.getmtime(f'{BASE_PATH}/frontend/benni_scene_presets_panel.js')))
    except OSError:
        return VERSION


async def async_setup_view(hass):
    static_paths = [
        StaticPathConfig(PANEL_URL, hass.config.path(f'{BASE_PATH}/frontend/benni_scene_presets_panel.js'), True),
        StaticPathConfig(f'/assets/{DOMAIN}/iconset.js', hass.config.path(f'{BASE_PATH}/res/iconset.js'), True)
    ]

    static_paths.extend(await get_preset_image_paths(hass))

    await hass.http.async_register_static_paths(static_paths)

    cache_bust = _cache_bust()

    hass.http.register_view(ScenePresetDataView)
    hass.http.register_view(ScenePresetImageUploadView)
    add_extra_js_url(hass, f"/assets/{DOMAIN}/iconset.js?{cache_bust}")

    async_register_built_in_panel(
        hass,
        component_name="custom",
        sidebar_title=NAME,
        sidebar_icon="benni_scene_presets:benni_scene_presets",
        frontend_url_path="benni_scene_presets",
        require_admin=False,
        config={
            "_panel_custom": {
                "name": "benni-scene-presets-panel",
                "module_url": f"{PANEL_URL}?{cache_bust}"
            },
            "version": VERSION
        },
    )

async def async_remove_view(hass):
    async_remove_panel(hass, "benni_scene_presets")

async def async_register_custom_image(hass, img_filename):
    """Register a static path for a single (newly uploaded) custom preset image."""
    await hass.http.async_register_static_paths([
        StaticPathConfig(
            f'/assets/{DOMAIN}/{img_filename}',
            hass.config.path(f'{BASE_PATH}/userdata/custom/assets/{img_filename}'),
            True
        )
    ])

async def get_preset_image_paths(hass):
    static_paths = []

    for preset in PRESET_DATA.get("presets", []):
        img_filename = preset.get("img")
        is_custom = preset.get("custom")

        if img_filename is not None:
            path = f"{BASE_PATH}/assets/{img_filename}"
            if is_custom is not None and is_custom:
                path = f"{BASE_PATH}/userdata/custom/assets/{img_filename}"

            static_paths.append(
                StaticPathConfig(
                    f'/assets/{DOMAIN}/{img_filename}',
                    hass.config.path(path),
                    True
                )
            )

    return static_paths
