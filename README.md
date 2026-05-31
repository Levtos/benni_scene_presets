# Benni Scene Presets

A Home Assistant custom integration for **dynamic, custom light scenes** — works with
any `light` entity, no vendor bridge or account required.

The integration is the **rendering / library layer**: it stores scenes and plays them
on lights. It deliberately knows nothing about presence, activity or day phase — that
arbitration lives in an external light policy that decides *which* scene runs *when*.

## Features

- **Create custom scenes in the UI** — auto-generated id, manual name, uploadable scene
  image, up to **10 colours** via colour picker (converted to xy server-side),
  interval & transition. Brightness is intentionally left out (handled by the policy /
  day phase at runtime).
- **Smooth first paint** — `start_dynamic_scene` honours the requested `transition` on the
  first paint for a real crossfade, instead of snapping in. An optional `initial_transition`
  field overrides just the first paint (set `0.5` for the classic snap).
- **Looks** *(planned)* — name a composition that binds light sets to scenes
  (e.g. strips → "Overwatch", bulbs → "Warm ambient") and play it in one call.

## Status

Under active, independent development. Versioned from `0.1.0`.

## License & attribution

Apache-2.0. This project is based on / forked from
[`hass-scene_presets`](https://github.com/Hypfer/hass-scene_presets) by Sören Beye,
also Apache-2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).

This is an independent fork: development, issues and pull requests happen here, not
upstream.
