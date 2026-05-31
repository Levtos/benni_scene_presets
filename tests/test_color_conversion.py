"""Pure-logic tests for RGB/hex -> xy conversion (no Home Assistant needed)."""
import os
import sys

sys.path.insert(
    0,
    os.path.join(os.path.dirname(__file__), "..", "custom_components", "benni_scene_presets"),
)

from color_conversion import (  # noqa: E402
    rgb_to_xy,
    hex_to_rgb,
    hex_to_xy,
    color_temperature_to_rgb,
    kelvin_to_xy,
)


def _close(a, b, tol=0.001):
    return abs(a - b) <= tol


def test_primaries_match_home_assistant_reference():
    # Values mirror homeassistant.util.color.color_RGB_to_xy
    rx, ry = rgb_to_xy(255, 0, 0)
    assert _close(rx, 0.7006) and _close(ry, 0.2993)

    gx, gy = rgb_to_xy(0, 255, 0)
    assert _close(gx, 0.1724) and _close(gy, 0.7468)

    bx, by = rgb_to_xy(0, 0, 255)
    assert _close(bx, 0.1355) and _close(by, 0.0399)


def test_white_is_near_d65():
    wx, wy = rgb_to_xy(255, 255, 255)
    assert _close(wx, 0.3227) and _close(wy, 0.329)


def test_black_does_not_divide_by_zero():
    assert rgb_to_xy(0, 0, 0) == (0.0, 0.0)


def test_hex_parsing():
    assert hex_to_rgb("#FF8800") == (255, 136, 0)
    assert hex_to_rgb("ff8800") == (255, 136, 0)
    assert hex_to_xy("#FF0000") == rgb_to_xy(255, 0, 0)


def test_invalid_hex_raises():
    try:
        hex_to_rgb("#FFF")
    except ValueError:
        return
    raise AssertionError("expected ValueError for short hex")


def test_color_temperature_endpoints_are_in_range():
    for k in (2000, 2700, 4000, 6500):
        r, g, b = color_temperature_to_rgb(k)
        assert 0.0 <= r <= 255.0
        assert 0.0 <= g <= 255.0
        assert 0.0 <= b <= 255.0
    # The reddest channel is always saturated below 6600K.
    assert color_temperature_to_rgb(2700)[0] == 255.0


def test_kelvin_to_xy_warm_is_redder_than_cool():
    warm_x, warm_y = kelvin_to_xy(2700)
    cool_x, cool_y = kelvin_to_xy(6500)
    # Warmer light sits further toward the red corner (higher x).
    assert warm_x > cool_x
    # Both stay inside the unit square.
    for v in (warm_x, warm_y, cool_x, cool_y):
        assert 0.0 <= v <= 1.0


def test_kelvin_6500_is_near_neutral_white():
    x, y = kelvin_to_xy(6500)
    assert _close(x, 0.32, tol=0.04) and _close(y, 0.33, tol=0.04)
