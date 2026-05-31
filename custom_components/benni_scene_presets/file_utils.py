import json
import os
import tempfile
import logging

_LOGGER = logging.getLogger(__name__)

BASE_PATH = os.path.dirname(os.path.realpath(__file__))
MANIFEST = json.load(
    open(os.path.join(BASE_PATH, 'manifest.json'))
)
VERSION = MANIFEST['version']

CUSTOM_DIR = os.path.join(BASE_PATH, 'userdata/custom')
CUSTOM_ASSETS_DIR = os.path.join(CUSTOM_DIR, 'assets')
CUSTOM_PRESETS_PATH = os.path.join(CUSTOM_DIR, 'presets.json')

os.makedirs(CUSTOM_ASSETS_DIR, exist_ok=True)

# Bundled (read-only) presets shipped with the integration.
BUNDLED_DATA = json.load(
    open(os.path.join(BASE_PATH, 'presets.json'))
)

# Merged view consumed by apply_preset and the data view. IMPORTANT: other
# modules do `from .file_utils import PRESET_DATA`, so we must mutate this dict
# in place on reload (never rebind it) for those references to stay valid.
PRESET_DATA = {}


def _read_custom():
    if os.path.exists(CUSTOM_PRESETS_PATH):
        try:
            with open(CUSTOM_PRESETS_PATH, 'r', encoding='utf-8') as file:
                return json.load(file)
        except (json.JSONDecodeError, OSError) as e:
            _LOGGER.error("Error loading custom presets: %s", e)
    return {"presets": [], "categories": []}


def _write_custom(data):
    os.makedirs(CUSTOM_DIR, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=CUSTOM_DIR, suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as file:
            json.dump(data, file, ensure_ascii=False, indent=2)
        os.replace(tmp_path, CUSTOM_PRESETS_PATH)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def reload_preset_data():
    """Rebuild the merged PRESET_DATA in place from bundled + custom presets."""
    custom = _read_custom()

    PRESET_DATA.clear()
    for key, value in BUNDLED_DATA.items():
        if key not in ("presets", "categories"):
            PRESET_DATA[key] = value

    PRESET_DATA["presets"] = (
        list(BUNDLED_DATA.get("presets", []))
        + [{**d, 'custom': True} for d in custom.get("presets", [])]
    )
    PRESET_DATA["categories"] = (
        list(BUNDLED_DATA.get("categories", []))
        + [{**d, 'custom': True} for d in custom.get("categories", [])]
    )
    return PRESET_DATA


def list_custom_presets():
    return _read_custom()


def save_custom_preset(preset):
    """Upsert a single custom preset by id and reload the merged view."""
    data = _read_custom()
    presets = data.setdefault("presets", [])

    for index, existing in enumerate(presets):
        if existing.get("id") == preset.get("id"):
            presets[index] = preset
            break
    else:
        presets.append(preset)

    _write_custom(data)
    reload_preset_data()
    return preset


def delete_custom_preset(preset_id):
    """Remove a custom preset (and its uploaded image) by id."""
    data = _read_custom()
    presets = data.get("presets", [])

    removed = None
    remaining = []
    for preset in presets:
        if preset.get("id") == preset_id:
            removed = preset
        else:
            remaining.append(preset)

    data["presets"] = remaining
    _write_custom(data)
    reload_preset_data()

    if removed and removed.get("img"):
        img_path = os.path.join(CUSTOM_ASSETS_DIR, removed["img"])
        try:
            if os.path.exists(img_path):
                os.remove(img_path)
        except OSError as e:
            _LOGGER.warning("Could not remove image %s: %s", img_path, e)

    return removed is not None


reload_preset_data()
