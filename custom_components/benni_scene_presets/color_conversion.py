"""RGB/hex -> CIE xy conversion.

Self-contained implementation matching Home Assistant's
homeassistant.util.color.color_RGB_to_xy so it can be unit-tested without
importing Home Assistant.
"""

import math


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


def _bound(value, minimum=0, maximum=255):
    return min(max(value, minimum), maximum)


def color_temperature_to_rgb(kelvin):
    """Approximate sRGB for a colour temperature in Kelvin.

    Mirrors homeassistant.util.color.color_temperature_to_rgb (the
    Tanner Helland / Neil Bartlett approximation) so kelvin_to_xy matches
    what Home Assistant would produce, without importing Home Assistant.
    """
    kelvin = _bound(kelvin, 1000, 40000)
    temp = kelvin / 100.0

    if temp <= 66:
        red = 255.0
    else:
        red = _bound(329.698727446 * ((temp - 60) ** -0.1332047592))

    if temp <= 66:
        green = _bound(99.4708025861 * math.log(temp) - 161.1195681661)
    else:
        green = _bound(288.1221695283 * ((temp - 60) ** -0.0755148492))

    if temp >= 66:
        blue = 255.0
    elif temp <= 19:
        blue = 0.0
    else:
        blue = _bound(138.5177312231 * math.log(temp - 10) - 305.0447927307)

    return (red, green, blue)


def kelvin_to_xy(kelvin):
    """Colour temperature (Kelvin) -> CIE (x, y), for colour-only lights."""
    r, g, b = color_temperature_to_rgb(kelvin)
    return rgb_to_xy(r, g, b)
