Screen: Import / Export

Ziel:
- Import/Export als klare Verwaltungsmaske neu bauen.
- JSON wird das primäre Exportformat.
- BSP1-String bleibt optional als Legacy-/Compact-Format lesbar, aber nicht mehr als Haupt-UX.

Navigation:
- Sidebar bleibt identisch.
- Aktiver Menüpunkt: Import / Export.

Export:
- Export Type:
  - Single Item
  - Multiple Items
  - Entire Library
- Item Type:
  - Look
  - RGB Scene
  - Kelvin Scene
  - Aqara Ring Effect
- Select Item bei Single Item
- Format:
  - JSON recommended
  - Minified JSON optional
  - Legacy BSP1 optional, wenn weiterhin unterstützt
- Include Optionen:
  - Metadata
  - Usage Info
  - Pretty Print
- Aktionen:
  - Export JSON
  - Copy to clipboard
  - Download file

JSON Preview:
- Großer lesbarer Code-Preview-Bereich.
- Zeigt export_format, version, exported_at, type, id/slug und data.
- Optional Toggle: pretty / minified.

Import:
- Importquellen:
  - From File
  - From Clipboard / Paste JSON
  - Legacy BSP1 String, falls unterstützt
- Datei-Dropzone für .json
- Textarea für Paste
- Import Options:
  - Merge Behavior:
    - Ask before import
    - Replace existing
    - Skip existing
  - Update existing items
  - Skip duplicates
  - Validate before import
- Import läuft nicht sofort.
- Erst Validate, dann Preview, dann Import.

Validation / Preview:
- Import Summary nach Validierung:
  - Items found
  - New items
  - Items to update
  - Duplicates
  - Conflicts
  - Errors
- Bei Konflikten explizit anzeigen:
  - gleicher Slug
  - inkompatible Version
  - fehlender Typ
  - ungültige Datenstruktur

Wording:
- “Import / Export”
- “JSON (recommended)”
- “Legacy BSP1 string” nur wenn nötig
- Nicht nur “Import into editor”
- Nicht direkt importieren ohne Vorschau.

Regeln:
- JSON muss versioniert sein.
- JSON muss type-aware sein:
  - look
  - rgb_scene
  - kelvin_scene
  - aqara_ring_effect
  - library_bundle
- Exportierte Bilder nur optional behandeln.
- Wenn Images nicht enthalten sind, klar anzeigen:
  - Images are not included in this export.
- Import muss validieren, bevor Daten übernommen werden.

Beispiel für ein sinnvolles JSON-Format:
{
  "export_format": "benni_scene_presets",
  "version": "1.0.0",
  "exported_at": "2026-06-01T12:00:00+02:00",
  "type": "rgb_scene",
  "data": {
    "slug": "neon_pulse",
    "name": "Neon Pulse",
    "category": "Gaming",
    "description": "Vibrant neon tones with magenta, cyan and blue accents.",
    "default_transition_hint": "smooth",
    "default_transition_time_s": 1.5,
    "brightness_hint": 100,
    "color_stops": [
      { "index": 1, "hex": "#ff2d87", "weight": 100 },
      { "index": 2, "hex": "#7b3dff", "weight": 100 },
      { "index": 3, "hex": "#00e3ff", "weight": 100 }
    ]
  }
}