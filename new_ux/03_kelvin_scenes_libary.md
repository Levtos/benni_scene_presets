Screen: Kelvin Scenes Library

Ziel:
- Eigene Library-Seite für wiederverwendbare Kelvin Scenes.
- Kelvin Scenes sind Weißtemperatur-Szenen für CCT und RGB+CCT Lampen.
- Kelvin Scenes haben keine persistenten Targets.
- Targets dürfen nur für Preview/Test verwendet werden.

Navigation:
- Sidebar bleibt identisch.
- Aktiver Menüpunkt: Kelvin Scenes.

Cards:
- Jede Kelvin Scene Card zeigt:
  - Warm/Kalt-Gradient oder Bild
  - Name
  - Favorite Star
  - Typ-Badge:
    - Sweep
    - Static
  - Kelvin-Werte oder Stop-Anzahl
  - Interval
  - Transition
  - Preview Button
  - Edit Button
  - More Button

Filter:
- All
- Sweep
- Static
- Favorites
- Category Filter

Detailpanel rechts:
- Zeigt ausgewählte Kelvin Scene.
- Enthält:
  - Preview Sweep mit Warm → Neutral → Cool Verlauf
  - Kelvin Stops als Chips, z. B. 3000K → 4500K → 6500K
  - Name
  - Category
  - Type
  - Kelvin Stops Count
  - Values
  - Interval
  - Transition
  - Smooth first paint enabled/disabled
  - Beschreibung
  - Compatibility:
    - CCT
    - RGB+CCT
    - not for RGB-only lights

Wording:
- “Kelvin Scene” verwenden.
- Nicht “White Preset”.
- Nicht generisch “Preset”.
- Aktion heißt “Preview”, nicht “Play”, weil es kein deploybarer Look ist.
- “Sweep” für dynamische Kelvin-Verläufe verwenden.
- “Static” für einzelne Kelvin-Werte verwenden.

Regel:
- Kein Shuffle prominent anzeigen, außer es wird fachlich wirklich für Kelvin genutzt.
- Keine dauerhafte Target-Auswahl auf dieser Seite anzeigen.
- Optionaler Button “Preview on test targets” ist okay, nutzt aber nur globale/testweise Targets.