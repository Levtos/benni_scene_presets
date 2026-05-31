import json
import os
import re
import tempfile
import logging

_LOGGER = logging.getLogger(__name__)


def slugify(name):
    """Human name -> stable, script/YAML-safe slug. No UUIDs."""
    slug = re.sub(r"[^a-z0-9]+", "-", (name or "").strip().lower()).strip("-")
    return slug or "scene"


def _unique_slug(base, taken):
    """Return base, or base-2/base-3/... if already taken."""
    if base not in taken:
        return base
    index = 2
    while f"{base}-{index}" in taken:
        index += 1
    return f"{base}-{index}"

BASE_PATH = os.path.dirname(os.path.realpath(__file__))
MANIFEST = json.load(
    open(os.path.join(BASE_PATH, 'manifest.json'))
)
VERSION = MANIFEST['version']

CUSTOM_DIR = os.path.join(BASE_PATH, 'userdata/custom')
CUSTOM_ASSETS_DIR = os.path.join(CUSTOM_DIR, 'assets')
CUSTOM_PRESETS_PATH = os.path.join(CUSTOM_DIR, 'presets.json')
LOOKS_PATH = os.path.join(CUSTOM_DIR, 'looks.json')

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
    """Rebuild the merged PRESET_DATA in place from bundled + custom presets.

    Keys are reassigned individually (no clear()) so a concurrent reader never
    observes a momentarily empty dict. BUNDLED_DATA is static, so no stale keys
    can accumulate.
    """
    custom = _read_custom()

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


def find_preset(ident):
    """Resolve a scene by slug or by human name (no UUIDs)."""
    if not ident:
        return None
    for preset in PRESET_DATA.get("presets", []):
        if preset.get("slug") == ident or preset.get("name") == ident:
            return preset
    return None


def save_custom_preset(preset):
    """Upsert a custom preset by slug and reload the merged view.

    A new preset (no slug) gets a unique slug derived from its name. An edit
    carries its existing slug, which stays frozen across renames so references
    don't break.
    """
    data = _read_custom()
    presets = data.setdefault("presets", [])

    slug = preset.get("slug")
    if not slug:
        taken = {p.get("slug") for p in presets if p.get("slug")}
        slug = _unique_slug(slugify(preset.get("name")), taken)
        preset["slug"] = slug

    for index, existing in enumerate(presets):
        if existing.get("slug") == slug:
            presets[index] = preset
            break
    else:
        presets.append(preset)

    _write_custom(data)
    reload_preset_data()
    return preset


def delete_custom_preset(slug):
    """Remove a custom preset (and its uploaded image) by slug."""
    data = _read_custom()
    presets = data.get("presets", [])

    removed = None
    remaining = []
    for preset in presets:
        if preset.get("slug") == slug:
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


# --- Looks (named compositions of scene/effect bindings) --------------------
#
# A look binds light sets to scenes (and, in phase B, to effect services):
#   {"slug","name","bindings":[
#       {"kind":"scene",  "targets":{...}, "scene":<slug|name>, "interval"?, "transition"?},
#       {"kind":"effect", "targets":{...}, "service":"domain.svc", "data":{...}}  # phase B
#   ]}
# Like PRESET_DATA, LOOKS is mutated in place on reload.

LOOKS = {"looks": []}


def _read_looks():
    if os.path.exists(LOOKS_PATH):
        try:
            with open(LOOKS_PATH, 'r', encoding='utf-8') as file:
                return json.load(file)
        except (json.JSONDecodeError, OSError) as e:
            _LOGGER.error("Error loading looks: %s", e)
    return {"looks": []}


def _write_looks(data):
    os.makedirs(CUSTOM_DIR, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=CUSTOM_DIR, suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as file:
            json.dump(data, file, ensure_ascii=False, indent=2)
        os.replace(tmp_path, LOOKS_PATH)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def reload_looks():
    data = _read_looks()
    LOOKS["looks"] = list(data.get("looks", []))
    return LOOKS


def list_looks():
    return _read_looks()


def get_look(ident):
    """Resolve a look by slug or by human name."""
    if not ident:
        return None
    for look in LOOKS.get("looks", []):
        if look.get("slug") == ident or look.get("name") == ident:
            return look
    return None


def save_look(look):
    data = _read_looks()
    looks = data.setdefault("looks", [])

    slug = look.get("slug")
    if not slug:
        taken = {item.get("slug") for item in looks if item.get("slug")}
        slug = _unique_slug(slugify(look.get("name")), taken)
        look["slug"] = slug

    for index, existing in enumerate(looks):
        if existing.get("slug") == slug:
            looks[index] = look
            break
    else:
        looks.append(look)

    _write_looks(data)
    reload_looks()
    return look


def delete_look(slug):
    data = _read_looks()
    looks = data.get("looks", [])
    remaining = [item for item in looks if item.get("slug") != slug]
    removed = len(remaining) != len(looks)
    data["looks"] = remaining
    _write_looks(data)
    reload_looks()
    return removed


reload_preset_data()
reload_looks()
