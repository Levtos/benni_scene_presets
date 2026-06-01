Screen: Target Picker Drawer

Ziel:
- Target-Auswahl aus dem Look Composer heraus in einen rechten Drawer verlagern.
- Keine großen Target-Checkbox-Blöcke mehr inline in Binding Cards.
- Der Drawer ist wiederverwendbar für alle Binding-Typen.

Kontext:
- Drawer öffnet aus einer Binding Row/Card.
- Hintergrund wird abgedunkelt.
- Oben wird klar angezeigt:
  - Binding Type
  - Source
  - kurze Erklärung

Binding-Typen:
- RGB Scene:
  - zeigt nur RGB und RGB+CCT-kompatible Lampen
- Kelvin Scene:
  - zeigt nur CCT und RGB+CCT-kompatible Lampen
- Aqara Ring Effect:
  - zeigt nur passende Aqara/RGBIC-Ring-Ziele, soweit erkennbar
- Off:
  - darf alle relevanten Lampen anbieten
- Raw Effect:
  - abhängig von Service/Advanced-Modus

Drawer-Elemente:
- Suche
- Filterbutton
- Gruppierung:
  - Group by Area
  - Group by Capability
- Statuszeile:
  - verfügbare Ziele
  - ausgewählte Ziele
  - bereits in diesem Look verwendete Ziele
- Clear selection
- Lampenliste nach Area/Gruppen
- Checkbox pro Lampe
- Capability Badge pro Lampe:
  - RGB
  - CCT
  - RGB+CCT
  - RGBIC Ring
- Disabled State für bereits verwendete Lampen
- Hinweis, in welchem Binding eine Lampe schon verwendet wird

Regeln:
- Eine Lampe darf pro Look nur in einem Binding verwendet werden.
- Bereits genutzte Lampen werden disabled oder ausgeblendet.
- Disabled ist besser als ausblenden, weil der Nutzer versteht, warum etwas fehlt.
- Apply Selection übernimmt die Auswahl ins Binding.
- Cancel verwirft Änderungen.
- Unten Info-Hinweis:
  - Already used lights are disabled to prevent duplicates.
  - A light can only be used in one binding per look.

UX:
- Drawer rechts.
- Breite ca. 420–520px.
- Keyboard/Escape schließt Drawer.
- Suche filtert Area, Entity ID und friendly name.
- Gruppierung nach Area ist Default.
- Gruppierung nach Capability optional.