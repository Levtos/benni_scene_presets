"""Pure-logic tests for RGB/hex -> xy conversion (no Home Assistant needed)."""
import os
import sys

sys.path.insert(
    0,
    os.path.join(os.path.dirname(__file__), "..", "custom_components", "benni_scene_presets"),
)

from color_conversion import rgb_to_xy, hex_to_rgb, hex_to_xy  # noqa: E402


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
