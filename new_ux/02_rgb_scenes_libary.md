Screen: RGB Scenes Library

Ziel:
- Eigene Library-Seite für wiederverwendbare RGB Scenes.
- RGB Scenes sind Farbszenen/Farbpaletten für RGB und RGB+CCT Lampen.
- RGB Scenes haben keine persistenten Targets.
- Targets dürfen nur für Preview/Test verwendet werden.

Navigation:
- Sidebar bleibt identisch.
- Aktiver Menüpunkt: RGB Scenes.

Cards:
- Jede RGB Scene Card zeigt:
  - Bild oder generierter Gradient
  - Name
  - Favorite Star
  - Status/Typ-Badges:
    - Dynamic
    - Static
    - Shuffle
    - Smooth
  - Anzahl Farben
  - Interval
  - Transition
  - Preview Button
  - Edit Button
  - More Button

Filter:
- All
- Dynamic
- Static
- Favorites
- Category Filter

Detailpanel rechts:
- Zeigt ausgewählte RGB Scene.
- Enthält:
  - Preview Gradient
  - Color Swatches
  - Name
  - Category
  - Type
  - Colors count
  - Interval
  - Transition
  - Shuffle enabled/disabled
  - Smooth first paint enabled/disabled
  - Beschreibung
  - Compatibility:
    - RGB
    - RGB+CCT
    - not for CCT-only lights

Wording:
- “RGB Scene” verwenden.
- Nicht “Custom preset”.
- Nicht generisch “Preset”.
- Aktion heißt “Preview”, nicht “Play”, weil es kein deploybarer Look ist.

Regel:
- Keine dauerhafte Target-Auswahl auf dieser Seite anzeigen.
- Optionaler Button “Preview on test targets” ist okay, nutzt aber nur globale/testweise Targets.