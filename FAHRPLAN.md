# Fahrplan — benni_scene_presets

**Stand:** 2026-06-08. Teil der koordinierten `benni_*`-Überarbeitung.

## Rolle in der abgestimmten Welt
**Render-/Ausführungs-Schicht.** Verwaltet Looks, Scenes, Presets, Aqara-Effekte und deren technische Umsetzung. Bekommt von `benni_light_policy` einen **Look-Ref + Brightness-Override** (`apply_look {look, brightness}`) und setzt ihn auf konkrete Lampen um. Die Rollentrennung Policy↔Render ist korrekt gebaut und soll so bleiben (gleicher Look-Slug kann auf Eltern-Anlage andere Lampen ansteuern).

## A1 Brightness — entlastet (2026-06-08, live verifiziert)
**scene_presets ist sauber.** Live-Test `apply_look {look: pride, brightness: 30/255}` greift sichtbar; der Dynamic-Scene-Parameter trägt die Brightness korrekt. Der wahrgenommene Bug liegt **nicht** hier — Details siehe `benni_light_policy/FAHRPLAN.md` (A1-Befund: Latenz durch lange `transition` + Feature-Lücke theme-spezifische Brightness; zusätzlich toter Legacy-YAML-Owner als Retire-Debt).

## Erledigt 2026-06-08
- **`apply_look` `transition`-Override:** neues optionales Feld (Schema + `services.yaml`) überschreibt den First-Paint-Fade (Off- + Scene-Bindings). light_policy nutzt es für reine Brightness-Änderungen (kurzer Fade statt langem Look-Crossfade).
- **`presets.py:161` Falsy-Bug gefixt:** `is not None` statt truthy — `brightness=0` wird nicht mehr auf den Preset-Default verworfen.

## Offen
- **Aqara/effect-Bindings** reichen den Brightness-Override nicht durch (`apply_look`). Bei den geprüften WZ-Looks laufen die Hauptlampen über `scene`-Bindings (Brightness greift); nur Decken-Aqara ist betroffen. Erst angehen, wenn ein Look die Hauptlampen via Aqara fährt.
- **Aqara/effect-Bindings** reichen den Brightness-Override nicht durch (`apply_look`). Bei den geprüften WZ-Looks laufen die Hauptlampen über `scene`-Bindings (Brightness greift); nur Decken-Aqara ist betroffen. Erst angehen, wenn ein Look die Hauptlampen via Aqara fährt.

## UX
Neues Multi-Screen-Frontend (`frontend/app/`, Screens 01–09) ist gebaut, ersetzt das alte Panel. Per Ziel-Architektur **wandert es später in die zentrale Umbrella-UX** — gilt als Prototyp dieser UX-Linie. Bleibendes Asset = die `benni_scene_presets/*`-WS-Commands.
