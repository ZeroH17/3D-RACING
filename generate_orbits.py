"""Bake a softly lit gas giant and a deterministic orbit catalogue.

Only the Python standard library is needed. Spherical texture coordinates,
warped latitude bands and local vortex fields create the cloud surface once;
the browser can then animate a few hundred small particles cheaply.

Run: python generate_orbits.py
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import random
import struct
import time
import zlib

from generate_universe import Noise


ROOT = Path(__file__).resolve().parent
TAU = math.tau


def write_rgba(path: Path, width: int, height: int, pixels: bytearray) -> None:
    """Write a lossless RGBA PNG without an imaging dependency."""
    def chunk(kind: bytes, payload: bytes) -> bytes:
        return (struct.pack(">I", len(payload)) + kind + payload
                + struct.pack(">I", zlib.crc32(kind + payload) & 0xffffffff))

    compressor = zlib.compressobj(8)
    output = bytearray()
    stride = width * 4
    for y in range(height):
        output.extend(compressor.compress(b"\0" + pixels[y * stride:(y + 1) * stride]))
    output.extend(compressor.flush())
    path.write_bytes(b"\x89PNG\r\n\x1a\n"
                     + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
                     + chunk(b"IDAT", bytes(output)) + chunk(b"IEND", b""))


def planet(size: int, radius: float, seed: int) -> bytearray:
    """Render a sphere with high altitude bands, vortices and limb scattering."""
    noise = Noise(random.Random(seed + 97))
    output = bytearray(size * size * 4)
    center = size / 2
    # Unit light vector points toward the upper left of the image.
    light_x, light_y, light_z = -0.52, -0.51, 0.685
    light_length = math.sqrt(light_x ** 2 + light_y ** 2 + light_z ** 2)
    light_x, light_y, light_z = (component / light_length
                                for component in (light_x, light_y, light_z))
    vortices = ((-0.33, 0.27, 0.34, 0.115, 2.4),
                (0.61, -0.36, 0.23, 0.075, -1.9),
                (-0.78, -0.12, 0.20, 0.06, 1.5))

    for y in range(size):
        ny = (y + 0.5 - center) / radius
        for x in range(size):
            nx = (x + 0.5 - center) / radius
            r2 = nx * nx + ny * ny
            offset = (y * size + x) * 4
            if r2 >= 1:
                distance = (math.sqrt(r2) - 1) * radius
                if distance > 11:
                    continue
                # A feathered, cool atmosphere with a brighter sunward limb.
                rim_light = max(0.0, nx * light_x + ny * light_y)
                alpha = math.exp(-distance / 2.1) * (0.035 + rim_light * 0.17)
                output[offset:offset + 4] = bytes((154, 150, 221, round(alpha * 255)))
                continue

            nz = math.sqrt(1 - r2)
            longitude = math.atan2(nx, nz)
            latitude = math.asin(ny)
            u, v = longitude, latitude
            # Local area-preserving rotations roll latitude bands into storms.
            for lon, lat, width, height, strength in vortices:
                dx, dy = (u - lon) / width, (v - lat) / height
                distance2 = dx * dx + dy * dy
                if distance2 < 6:
                    turn = strength * math.exp(-distance2 * 0.8)
                    cosine, sine = math.cos(turn), math.sin(turn)
                    u = lon + (dx * cosine - dy * sine) * width
                    v = lat + (dx * sine + dy * cosine) * height

            broad = noise(u * 4.0 + 18, v * 10.0 + 33)
            middle = noise(u * 15.0 + 53, v * 37.0 + 14)
            fine = noise(u * 54.0 + 11, v * 151.0 + 68)
            warped = (v + 0.017 * math.sin(u * 6 + v * 8)
                      + (broad - 0.5) * 0.048 + (middle - 0.5) * 0.016)
            bands = (math.sin(warped * 49 + (broad - 0.5) * 1.2) * 0.61
                     + math.sin(warped * 111 + u * 0.8) * 0.26
                     + math.sin(warped * 237 + middle * 2.6) * 0.13)
            clouds = bands * 0.5 + 0.5
            texture = (middle - 0.5) * 0.10 + (fine - 0.5) * 0.06
            # Ivory cloud tops over desaturated lilac lower layers.
            red = 132 + clouds * 84 + texture * 255
            green = 125 + clouds * 84 + texture * 245
            blue = 160 + clouds * 67 + texture * 265
            # A broad belt adds planetary scale beneath the fine cloud filaments.
            belt = math.exp(-((latitude + 0.17) / 0.12) ** 2)
            red -= belt * 14
            green -= belt * 17
            blue -= belt * 6

            diffuse = max(0.0, nx * light_x + ny * light_y + nz * light_z)
            shade = 0.023 + 0.977 * diffuse ** 0.68
            # Subtle blue light scattered near the silhouette.
            atmosphere = (1 - nz) ** 5 * (0.03 + diffuse * 0.27)
            alpha = min(1.0, (1 - math.sqrt(r2)) * radius + 0.5)
            output[offset] = min(255, round(red * shade + atmosphere * 111))
            output[offset + 1] = min(255, round(green * shade + atmosphere * 119))
            output[offset + 2] = min(255, round(blue * shade + atmosphere * 187))
            output[offset + 3] = round(max(0.0, alpha) * 255)
    return output


def orbit_catalogue(seed: int) -> dict:
    """Precompute distributions and Kepler-like speeds; no random work per frame."""
    rng = random.Random(seed + 24)
    planes = [{"tilt": 0.32, "rotation": -0.42},
              {"tilt": 0.50, "rotation": 0.61},
              {"tilt": 0.24, "rotation": 1.28}]
    particles = []
    for index in range(430):
        plane = rng.choices((0, 1, 2), weights=(0.57, 0.28, 0.15))[0]
        if plane == 0:
            radius = max(1.42, min(2.74, rng.gauss(2.08, 0.28)))
        elif plane == 1:
            radius = rng.uniform(1.58, 3.15)
        else:
            radius = rng.uniform(1.68, 2.95)
        speed = min(0.24, 0.34 / radius ** 1.1 * rng.uniform(0.86, 1.14))
        if plane == 1:
            speed *= -1
        accent = index < 10
        particles.append([round(radius, 4), round(rng.random() * TAU, 5),
                          round(speed, 5), round(rng.uniform(1.65, 2.5) if accent
                                                else rng.uniform(0.4, 1.25), 3),
                          round(rng.uniform(0.78, 1.0) if accent
                                else rng.uniform(0.2, 0.78), 3), plane])
    return {"seed": seed,
            "schema": ["radius", "phase", "speed", "size", "brightness", "plane"],
            "planet": {"imageSize": 720, "radius": 320},
            "planes": planes, "particles": particles}


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=1402)
    args = parser.parse_args(argv)
    assets = ROOT / "assets"
    assets.mkdir(exist_ok=True)
    started = time.perf_counter()
    write_rgba(assets / "planet.png", 720, 720, planet(720, 320, args.seed))
    catalogue = orbit_catalogue(args.seed)
    (assets / "orbits.json").write_text(json.dumps(catalogue, separators=(",", ":")),
                                        encoding="utf-8")
    print(f"Created 720 × 720 planet and {len(catalogue['particles'])} orbital stars "
          f"in {time.perf_counter() - started:.1f}s.")


if __name__ == "__main__":
    main()
