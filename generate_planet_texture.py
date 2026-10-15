"""Bake a seamless cloud map for the draggable birthday planet.

The unlit equirectangular surface is generated once with Python's standard
library. The browser then maps it onto a sphere and lights it in WebGL, so
dragging rotates the clouds themselves without moving the light source.

Run: python generate_planet_texture.py
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path
import random
import time

from generate_universe import Noise, png


ROOT = Path(__file__).resolve().parent
TAU = math.tau


def planet_texture(width: int, height: int, seed: int) -> bytearray:
    """Return lilac and ivory clouds, periodic in longitude and unlit."""
    noise = Noise(random.Random(seed + 97))
    output = bytearray(width * height * 3)
    # Longitude, latitude, width, height, and swirl direction of cloud storms.
    vortices = ((-0.33, 0.27, 0.34, 0.115, 2.4),
                (0.61, -0.36, 0.23, 0.075, -1.9),
                (-1.78, -0.12, 0.30, 0.08, 1.8),
                (2.34, 0.43, 0.40, 0.095, -2.3),
                (-2.78, -0.48, 0.26, 0.07, 1.7))

    for y in range(height):
        latitude = math.pi * (0.5 - (y + 0.5) / height)
        polar_fade = max(0.0, math.cos(latitude)) ** 0.65
        for x in range(width):
            longitude = TAU * ((x + 0.5) / width - 0.5)
            u, v = longitude, latitude
            for lon, lat, storm_width, storm_height, strength in vortices:
                # The wrapped difference keeps storms continuous at the seam.
                dx = math.atan2(math.sin(u - lon), math.cos(u - lon)) / storm_width
                dy = (v - lat) / storm_height
                distance2 = dx * dx + dy * dy
                if distance2 < 7:
                    turn = strength * math.exp(-distance2 * 0.8)
                    cosine, sine = math.cos(turn), math.sin(turn)
                    u = lon + (dx * cosine - dy * sine) * storm_width
                    v = lat + (dx * sine + dy * cosine) * storm_height

            # Circular noise sampling is exactly periodic across longitude.
            broad = noise(math.cos(u) * 4 + 18 + v * 2,
                          math.sin(u) * 4 + 33 + v * 10)
            middle = noise(math.cos(u) * 15 + 53 + v * 4,
                           math.sin(u) * 15 + 14 + v * 37)
            fine = noise(math.cos(u) * 54 + 11 + v * 8,
                         math.sin(u) * 54 + 68 + v * 151)
            warped = (v + polar_fade * (0.017 * math.sin(u * 6 + v * 8)
                      + (broad - 0.5) * 0.048 + (middle - 0.5) * 0.016))
            bands = (math.sin(warped * 49 + (broad - 0.5) * polar_fade * 1.2) * 0.61
                     + math.sin(warped * 111 + math.sin(u) * polar_fade * 0.8) * 0.26
                     + math.sin(warped * 237 + middle * polar_fade * 2.6) * 0.13)
            clouds = bands * 0.5 + 0.5
            grain = ((middle - 0.5) * 0.10 + (fine - 0.5) * 0.055) * polar_fade
            belt = math.exp(-((latitude + 0.17) / 0.12) ** 2)
            channels = (132 + clouds * 84 + grain * 255 - belt * 14,
                        125 + clouds * 84 + grain * 245 - belt * 17,
                        160 + clouds * 67 + grain * 265 - belt * 6)
            offset = (y * width + x) * 3
            output[offset:offset + 3] = bytes(max(0, min(255, round(c))) for c in channels)
    return output


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=1402)
    parser.add_argument("--width", type=int, default=1024,
                        help="Power-of-two width; image height is half the width.")
    args = parser.parse_args(argv)
    if args.width < 128 or args.width > 2048 or args.width & (args.width - 1):
        parser.error("--width must be a power of two from 128 to 2048")
    assets = ROOT / "assets"
    assets.mkdir(exist_ok=True)
    started = time.perf_counter()
    png(assets / "planet-texture.png", args.width, args.width // 2,
        planet_texture(args.width, args.width // 2, args.seed))
    print(f"Created seamless {args.width} × {args.width // 2} planet texture "
          f"in {time.perf_counter() - started:.1f}s.")


if __name__ == "__main__":
    main()
