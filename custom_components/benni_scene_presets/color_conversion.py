"""RGB/hex -> CIE xy conversion.

Self-contained implementation matching Home Assistant's
homeassistant.util.color.color_RGB_to_xy so it can be unit-tested without
importing Home Assistant.
"""


def _gamma(channel):
    channel = channel / 255.0
    if channel > 0.04045:
        return ((channel + 0.055) / 1.055) ** 2.4
    return channel / 12.92


def rgb_to_xy(r, g, b):
    """Convert 0-255 sRGB to a CIE 1931 (x, y) tuple, rounded to 4 decimals."""
    red = _gamma(r)
    green = _gamma(g)
    blue = _gamma(b)

    x = red * 0.664511 + green * 0.154324 + blue * 0.162028
    y = red * 0.283881 + green * 0.668433 + blue * 0.047685
    z = red * 0.000088 + green * 0.072310 + blue * 0.986039

    total = x + y + z
    if total == 0:
        return (0.0, 0.0)

    return (round(x / total, 4), round(y / total, 4))


def hex_to_rgb(value):
    """Parse '#RRGGBB' (or 'RRGGBB') into an (r, g, b) tuple."""
    value = value.lstrip('#')
    if len(value) != 6:
        raise ValueError(f"Invalid hex color: {value!r}")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def hex_to_xy(value):
    r, g, b = hex_to_rgb(value)
    return rgb_to_xy(r, g, b)
