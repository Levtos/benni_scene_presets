Screen: RGB Scene Editor

Ziel:
- Editor zum Erstellen/Bearbeiten wiederverwendbarer RGB Scenes.
- RGB Scenes sind device-agnostische Farbpaletten.
- RGB Scenes speichern keine dauerhaften Targets.
- Targets sind nur für Preview/Test relevant.

Navigation:
- Sidebar bleibt identisch.
- Aktiver Menüpunkt: RGB Scenes.

Header:
- Titel: Edit RGB Scene oder Create RGB Scene
- Aktionen oben rechts:
  - Cancel
  - Preview on test targets
  - Save Scene

Basis-Felder:
- Image / Preview-Bild mit Edit/Upload Button
- Scene Name
- Slug mit Copy Button
- Category
- Tags optional
- Description optional
- Default Transition Hint
- Default Transition Time
- Brightness Hint optional, falls fachlich gewünscht

Color Stops:
- Liste von bis zu 10 Color Stops.
- Jeder Stop zeigt:
  - Drag Handle
  - Index
  - Farbswatch
  - HEX-Wert
  - optional Gewichtung/Relative Weight
  - Delete Button
- Button: Add Color Stop
- Reihenfolge per Drag & Drop änderbar.

Color Editor:
- Moderne Farbauswahl statt nativer Browser-/Windows-Farbpicker-Anmutung.
- Tabs möglich:
  - Color Wheel
  - Palette
  - Gradient Preview
- Werte:
  - HEX
  - H/S/B oder H/S/V
  - Alpha nur anzeigen, wenn wirklich unterstützt
  - Relative Weight optional

Preview Panel:
- Live Gradient Preview
- Preview on test targets Button
- Scene Info:
  - Anzahl Farben
  - Estimated Loop
  - Transition Hint
  - Brightness Hint
  - Created / Updated
  - Used in Looks
- Validation:
  - Color sequence valid
  - Values in range

Wording:
- “RGB Scene” verwenden.
- “Color Stops” statt nur “Colours”, wenn Reihenfolge/Gewichtung wichtig ist.
- “Preview” statt “Play”.
- Nicht “Custom preset”.
- Nicht generisch “Preset”.

Regeln:
- Keine permanente Target-Auswahl im Editor.
- Hinweis anzeigen:
  - This scene is device-agnostic. Actual rendering depends on target lights and capabilities.
- Speichern soll nur die Scene-Daten speichern, keine Targets.