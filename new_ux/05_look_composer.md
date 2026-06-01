Screen: Look Composer

Ziel:
- Zentraler Editor für deploybare Looks.
- Nur Looks enthalten dauerhafte Targets.
- Looks bestehen aus mehreren Bindings.
- Bindings werden von oben nach unten angezeigt und logisch gruppiert.
- Ein Binding weist Targets einer Aktion zu.

Look-Felder:
- Look Name
- Slug mit Copy Button
- Image Upload / Image Preview
- Look Transition
- Transition Time
- Description optional
- Save Look
- Preview on test targets
- Cancel

Binding-Typen:
- RGB Scene
- Kelvin Scene
- Aqara Ring Effect
- Off
- Raw Effect

Binding Card / Row:
- Jede Binding-Zeile zeigt:
  - Reihenfolge / Index
  - Type
  - Source
  - Targets
  - Capability Tags
  - Edit Targets Button
  - Duplicate Button
  - Delete Button
  - Validation Icon

Binding-Regeln:
- Eine Lampe darf pro Look nur in einem Binding vorkommen.
- Bereits genutzte Lampen sollen im Target Picker anderer Bindings disabled oder ausgeblendet sein.
- Off ist ein eigener Binding-Typ und muss bewusst sichtbar bleiben.
- Aqara Ring Effect ist nur eine AAL-Referenz, keine native Effektbearbeitung.
- Raw Effect bleibt Advanced/Fallback.

Coverage & Validation Panel:
- Rechts dauerhaft sichtbar.
- Zeigt:
  - Anzahl abgedeckter Lampen
  - Duplicate Targets
  - Unsupported Targets
  - Previously used lights not covered
  - Capability Summary:
    - RGB
    - CCT
    - RGB+CCT
    - Aqara Ring
    - Off
  - Validation Rules:
    - No duplicate targets
    - All targets supported
    - Previously used lights covered or intentionally Off

UX:
- Add Binding prominent oberhalb und am Ende der Liste.
- Reorder-Modus optional, aber sichtbar.
- Save erst klar erreichbar, wenn Validierung passt.
- “View Look as JSON” optional als Debug/Advanced Button.
- Hinweis anzeigen: Bindings werden top-to-bottom dargestellt, laufen aber auf ihren jeweiligen Targets.