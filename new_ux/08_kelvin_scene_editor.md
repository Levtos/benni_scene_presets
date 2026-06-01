Screen: Kelvin Scene Editor

Ziel:
- Editor zum Erstellen/Bearbeiten wiederverwendbarer Kelvin Scenes.
- Kelvin Scenes sind device-agnostische Weißtemperatur-Sequenzen.
- Kelvin Scenes speichern keine dauerhaften Targets.
- Targets sind nur für Preview/Test relevant.

Navigation:
- Sidebar bleibt identisch.
- Aktiver Menüpunkt: Kelvin Scenes.

Header:
- Titel: Edit Kelvin Scene oder Create Kelvin Scene
- Aktionen oben rechts:
  - Cancel
  - Preview on test targets
  - Save Scene

Basis-Felder:
- Image / Preview-Bild mit Change Image Button
- Scene Name
- Slug mit Copy Button
- Category
- Tags optional
- Description optional
- Default Transition Hint
- Default Transition Time
- Brightness Hint optional, falls fachlich gewünscht

Kelvin Stops:
- Liste von bis zu 10 Kelvin Stops.
- Jeder Stop zeigt:
  - Drag Handle
  - Index
  - Warm/Kalt-Swatch
  - Kelvin-Wert
  - optionale Gewichtung/Relative Weight
  - Delete Button
- Button: Add Kelvin Stop
- Reihenfolge per Drag & Drop änderbar.

Temperature Editor:
- Keine RGB-Farblogik.
- Fokus auf Kelvin/CCT.
- Temperatur-Gradient von warm nach kühl.
- Einzelner Stop editierbar über:
  - Kelvin Input
  - Slider
  - Relative Weight
- Valid Range anzeigen, z. B. 1800K bis 10000K oder passend zur Backend-Logik.

Preview Panel:
- Live Preview mit Kelvin-Kacheln oder Verlauf.
- Preview on test targets Button.
- Scene Info:
  - Anzahl Kelvin Stops
  - Estimated Loop
  - Transition Hint
  - Brightness Hint
  - Created / Updated
  - Used in Looks
- Validation:
  - Kelvin sequence valid
  - Values in range
  - At least 2 stops defined für Sweep

Wording:
- “Kelvin Scene” verwenden.
- “Kelvin Stops” verwenden.
- “Sweep” für dynamische Kelvin-Verläufe.
- “Static” für einzelne Kelvin-Werte.
- Nicht “White Preset”.
- Nicht generisch “Preset”.

Regeln:
- Keine permanente Target-Auswahl im Editor.
- Hinweis anzeigen:
  - This Kelvin scene is device-agnostic. Actual rendering depends on target lights and capabilities.
- Speichern soll nur die Kelvin Scene speichern, keine Targets.