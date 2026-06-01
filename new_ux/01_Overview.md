Screen: Overview / Looks

Ziel:
- Die Hauptseite zeigt ausschließlich deploybare Looks.
- RGB Scenes, Kelvin Scenes und Aqara Ring Effects erscheinen nicht mehr als Hauptkarten.
- Looks sind die Einheiten, die Play/Stop/Edit bekommen.

Navigation:
- Linke Sidebar mit fester Struktur:
  - Overview
  - RGB Scenes
  - Kelvin Scenes
  - Aqara Ring Effects
  - Look Composer
  - Import / Export
  - Settings

Look Cards:
- Jede Karte zeigt:
  - Bild oder Gradient
  - Name
  - Status: Playing / Ready / Warning / Error
  - Anzahl Bindings
  - Anzahl Targets
  - Favorite Star
  - Play
  - Stop
  - Edit
  - More

Detailpanel rechts:
- Zeigt den ausgewählten Look.
- Enthält:
  - Name
  - Slug mit Copy Button
  - Beschreibung optional
  - Composition / Binding-Liste:
    - RGB Scene
    - Kelvin Scene
    - Aqara Ring Effect
    - Off
  - Coverage Status:
    - abgedeckte Lampen
    - keine Duplikate
    - keine unsupported Targets
    - zuvor genutzte Lampen abgedeckt
  - Capability Summary:
    - RGB
    - CCT
    - RGB+CCT
    - Off

Wording:
- Nicht “Preset” als Primärbegriff verwenden.
- Hauptbegriff auf dieser Seite: Look.
- Composition statt “verkettete Szenen”.
- Aqara Preset heißt im UI: Aqara Ring Effect.

Quick Actions:
- Stop all: stoppt laufende Looks/Szenen, Lampen bleiben an.
- Off all: stoppt alles und schaltet die von der Integration geführten Lampen aus.

Design:
- Dracula-inspirierter Dark Mode.
- Akzente in Purple und Cyan.
- Statusfarben:
  - Playing: Grün
  - Ready: neutral
  - Warning: Gelb
  - Error: Rot