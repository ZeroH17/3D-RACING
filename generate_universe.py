"""Create the birthday universe with deterministic, dependency-free Python.

The galaxy is a photographic-style exposure of 620,000 stars distributed along
logarithmic spiral arms. A projected stellar disc, dust extinction and a warm
central bulge are composited once, so the browser only animates a small backdrop.

Run: python generate_universe.py
"""

from __future__ import annotations

import argparse
from array import array
import json
import math
from pathlib import Path
import random
import struct
import time
import zlib


ROOT = Path(__file__).resolve().parent
TAU = math.tau


def png(path: Path, width: int, height: int, rgb: bytearray) -> None:
    """Write an RGB PNG using only the Python standard library."""
    def chunk(kind: bytes, payload: bytes) -> bytes:
        return (struct.pack(">I", len(payload)) + kind + payload
                + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF))

    compressor = zlib.compressobj(7)
    encoded = bytearray()
    stride = width * 3
    for y in range(height):
        encoded.extend(compressor.compress(b"\0" + rgb[y * stride:(y + 1) * stride]))
    encoded.extend(compressor.flush())
    path.write_bytes(b"\x89PNG\r\n\x1a\n"
                     + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
                     + chunk(b"IDAT", bytes(encoded)) + chunk(b"IEND", b""))


def blur(source: array, width: int, height: int, radius: int) -> array:
    """Separable O(width*height) box exposure, with dark borders."""
    out = array("f", [0.0]) * len(source)
    target = array("f", [0.0]) * len(source)
    divisor = 1 / (radius * 2 + 1)
    for y in range(height):
        row = y * width
        value = sum(source[row:row + radius + 1])
        for x in range(width):
            out[row + x] = value * divisor
            entering, leaving = x + radius + 1, x - radius
            if entering < width:
                value += source[row + entering]
            if leaving >= 0:
                value -= source[row + leaving]
    for x in range(width):
        value = sum(out[y * width + x] for y in range(radius + 1))
        for y in range(height):
            target[y * width + x] = value * divisor
            entering, leaving = y + radius + 1, y - radius
            if entering < height:
                value += out[entering * width + x]
            if leaving >= 0:
                value -= out[leaving * width + x]
    return target


class Noise:
    """A repeatable continuous field for the interstellar dust clouds."""
    def __init__(self, rng: random.Random):
        self.grid = [rng.random() for _ in range(128 * 128)]

    def __call__(self, x: float, y: float) -> float:
        ix, iy = math.floor(x), math.floor(y)
        fx, fy = x - ix, y - iy
        fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
        a, b = (iy & 127) * 128, ((iy + 1) & 127) * 128
        c, d = ix & 127, (ix + 1) & 127
        grid = self.grid
        return ((grid[a + c] * (1 - fx) + grid[a + d] * fx) * (1 - fy)
                + (grid[b + c] * (1 - fx) + grid[b + d] * fx) * fy)


def galaxy(width: int, height: int, seed: int) -> bytearray:
    rng = random.Random(seed)
    pixels = width * height
    exposure = array("f", [0.0]) * pixels
    scale = width * 0.354
    cx, cy = width * 0.5, height * 0.5
    inclination, rotation = 0.43, -0.385
    cosine, sine = math.cos(rotation), math.sin(rotation)

    def project(u: float, v: float) -> tuple[float, float]:
        v *= inclination
        return cx + (u * cosine - v * sine) * scale, cy + (u * sine + v * cosine) * scale

    # A mixture of continuous old stars and young stars along two winding arms.
    # Gamma-distributed radii approximate an exponential surface-brightness disc.
    highlights = []
    for index in range(620000):
        radius = rng.gammavariate(2.0, 0.235)
        if radius > 1.55:
            continue
        population = rng.random()
        if population < 0.76:
            angle = 2.9 * math.log(radius + 0.075) + rng.randrange(2) * math.pi
            angle += 0.11 * math.sin(radius * 19) + 0.045 * math.sin(radius * 47)
            angle += rng.gauss(0, 0.26 + radius * 0.14)
            if population < 0.12:
                angle += 0.49
        else:
            angle = rng.random() * TAU
        x, y = project(radius * math.cos(angle), radius * math.sin(angle))
        ix, iy = int(x), int(y)
        if not (1 <= ix < width - 2 and 1 <= iy < height - 2):
            continue
        flux = (0.1 + rng.random() ** 4 * 2.2) * math.exp(-radius * 0.6)
        position = iy * width + ix
        fx, fy = x - ix, y - iy
        exposure[position] += flux * (1 - fx) * (1 - fy)
        exposure[position + 1] += flux * fx * (1 - fy)
        exposure[position + width] += flux * (1 - fx) * fy
        exposure[position + width + 1] += flux * fx * fy
        if index % 169 == 0 and radius > 0.15:
            highlights.append((ix, iy, rng.uniform(0.35, 0.85)))

    print("Resolving the stellar exposure…", flush=True)
    soft = blur(exposure, width, height, max(1, round(width / 800)))
    haze = blur(soft, width, height, max(3, round(width / 170)))
    noise = Noise(random.Random(seed + 11))
    rgb = bytearray(pixels * 3)
    inv_scale = 1 / scale
    inv_inc = 1 / inclination
    exp, sqrt, log, atan2, cos = math.exp, math.sqrt, math.log, math.atan2, math.cos

    print("Calculating dust, stellar temperatures and the galactic core…", flush=True)
    for y in range(height):
        dy = (y - cy) * inv_scale
        for x in range(width):
            dx = (x - cx) * inv_scale
            u = dx * cosine + dy * sine
            screen_v = -dx * sine + dy * cosine
            v = screen_v * inv_inc
            radius = sqrt(u * u + v * v)
            if radius > 1.7:
                continue
            position = y * width + x
            cloud = (noise(u * 13 + 40, v * 13 + 40) * 0.52
                     + noise(u * 43 + 60, v * 43 + 60) * 0.31
                     + noise(u * 121 + 18, v * 121 + 18) * 0.17)
            angle = atan2(v, u)
            spiral = angle - 2.9 * log(radius + 0.075)
            spiral -= 0.11 * math.sin(radius * 19) + 0.045 * math.sin(radius * 47)
            dust_lane = exp(-(1 - cos(spiral * 2 - 0.65 + (cloud - 0.5) * 1.4)) * 7)
            dust = max(0.1, 1 - dust_lane * (0.48 + cloud * 0.5))
            patchiness = 0.17 + cloud * cloud * 2.7
            stellar = (soft[position] * 0.87 + haze[position] * 1.25
                       + exposure[position] * 0.12) * patchiness * dust
            stellar *= 0.7 * (1 - exp(-radius * 6))
            smooth_disc = 0.048 * exp(-radius * 3.0)
            # A nearly spherical central bulge remains rounder than the disc.
            bulge_r = sqrt((u * 1.02) ** 2 + (screen_v * 1.8) ** 2)
            bulge = 2.7 * exp(-(bulge_r * 10.5) ** 0.86)
            core = 1.65 * exp(-((u / 0.047) ** 2 + (screen_v / 0.033) ** 2))
            halo = 0.023 * exp(-sqrt(dx * dx + dy * dy) * 4)
            edge = min(1.0, max(0.0, (1.62 - radius) * 6))
            cool = stellar * edge
            warm = bulge + core
            p = position * 3
            # Film-like exponential tone curve retains a bright ivory center.
            old_population = exp(-radius * 3.6)
            red = cool * (0.69 + old_population * 0.5) + warm * 1.21 + smooth_disc * 0.94 + halo * 0.6
            green = cool * (0.71 + old_population * 0.25) + warm * 0.97 + smooth_disc * 0.88 + halo * 0.65
            blue = cool * (0.93 - old_population * 0.25) + warm * 0.70 + smooth_disc * 0.94 + halo
            rgb[p] = min(255, int(255 * (1 - exp(-red * 1.5))))
            rgb[p + 1] = min(255, int(255 * (1 - exp(-green * 1.5))))
            rgb[p + 2] = min(255, int(255 * (1 - exp(-blue * 1.5))))

    # Rare, crisp foreground stars provide scale against the soft spiral arms.
    for _ in range(145):
        x, y = rng.randrange(80, width - 80), rng.randrange(80, height - 80)
        if rng.random() < 0.62:
            highlights.append((x, y, rng.uniform(0.34, 0.9)))
    for x, y, light in highlights:
        base = (y * width + x) * 3
        for channel, tint in enumerate((0.88, 0.92, 1.0)):
            rgb[base + channel] = min(255, rgb[base + channel] + int(light * 135 * tint))
        if light > 0.78:
            for offset, multiplier in ((1, 0.19), (-1, 0.19), (width, 0.19), (-width, 0.19)):
                p = base + offset * 3
                for channel in range(3):
                    rgb[p + channel] = min(255, rgb[p + channel] + int(light * 80 * multiplier))
    return rgb


def star_catalogue(seed: int) -> dict:
    rng = random.Random(seed + 8)
    # x/y are normalized, radius is in CSS pixels, phase is in radians and
    # speed is the sinusoidal twinkle rate. No random work is needed per frame.
    stars = [[round(rng.random(), 5), round(rng.random(), 5),
              round(rng.uniform(0.35, 1.45), 3), round(rng.uniform(0.16, 0.72), 3),
              round(rng.random() * TAU, 4), round(rng.uniform(0.18, 0.6), 3)]
             for _ in range(320)]
    return {"seed": seed, "schema": ["x", "y", "radius", "brightness", "phase", "speed"],
            "stars": stars}


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--width", type=int, default=2200)
    parser.add_argument("--height", type=int, default=1500)
    parser.add_argument("--seed", type=int, default=1402)
    args = parser.parse_args(argv)
    if args.width < 400 or args.height < 300:
        parser.error("Use an image at least 400 × 300 pixels.")
    started = time.perf_counter()
    assets = ROOT / "assets"
    assets.mkdir(exist_ok=True)
    pixels = galaxy(args.width, args.height, args.seed)
    png(assets / "galaxy.png", args.width, args.height, pixels)
    (assets / "universe.json").write_text(
        json.dumps(star_catalogue(args.seed), separators=(",", ":")), encoding="utf-8")
    print(f"Created {args.width} × {args.height} galaxy and 320 stars in "
          f"{time.perf_counter() - started:.1f}s.")


if __name__ == "__main__":
    main()
