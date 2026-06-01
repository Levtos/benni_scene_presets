Screen: Aqara Ring Effects Library

Ziel:
- Eigene Library-Seite für Aqara Ring Effect References.
- Die Integration erzeugt/designt keine Aqara RGBIC Effekte selbst.
- Sie speichert nur Referenzen auf Aqara Advanced Lighting / AAL Aktionen.
- Diese Referenzen können später im Look Composer als Binding-Quelle genutzt werden.
- Targets werden nicht dauerhaft hier gespeichert.

Navigation:
- Sidebar bleibt identisch.
- Aktiver Menüpunkt: Aqara Ring Effects.

Cards:
- Jede Karte zeigt:
  - Name
  - optionales Icon/Bild
  - Badge: AAL reference
  - Service/Action Name
  - Status: Ready / Warning / Error, falls validierbar
  - Favorite Star
  - Preview Button
  - Edit Button
  - More Button

Detailpanel rechts:
- Titel: Aqara Ring Effect Reference
- Enthält:
  - Name
  - Service / Action
  - Copy Button für Service/Action
  - Service Data Preview als Codeblock
  - Copy Button für Service Data
  - Category
  - Status
  - Created / Updated
  - Used in Looks Liste
  - Notes:
    - Executed through Aqara Advanced Lighting (AAL)
    - Behaviour may vary between devices and firmware versions

Wording:
- Sidebar: Aqara Ring Effects
- Card Badge: AAL reference
- Detail Subtitle: Aqara Ring Effect Reference
- Button: New Ring Effect
- Nicht “Aqara Preset”
- Nicht “native RGBIC effect”
- Nicht “Ring Designer”

Preview:
- “Preview on test targets” ist erlaubt.
- Preview nutzt nur aktuell gewählte Test-Targets.
- Preview darf nicht suggerieren, dass die Integration den Effekt intern rendern kann.

Nicht umsetzen:
- Kein nativer RGBIC Ring Designer.
- Keine komplexe Firmware-/Device-Kompatibilitätsmatrix, außer Backend validiert sie wirklich.
- Keine dauerhafte Target-Auswahl auf dieser Seite.