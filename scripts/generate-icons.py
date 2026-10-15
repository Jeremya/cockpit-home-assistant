"""Derives the Maurice icon set in assets/ from assets/source/maurice.png.

The source artwork is a rounded square on a white margin. The script isolates the
rounded square, extends its navy background over the white corners for full-bleed
icons, and keeps a transparent-corner copy for the README and the About panel.
Run: python3 scripts/generate-icons.py  (Pillow + NumPy)
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "source" / "maurice.png"
OUT = ROOT / "assets"


def outside_mask(rgb: np.ndarray) -> np.ndarray:
    """White margin connected to the border (the cream shirt is not pure white)."""
    near_white = (rgb.min(axis=2) >= 249).astype(np.uint8) * 255
    flood = Image.fromarray(near_white, "L").copy()  # writable: fromarray may share a read-only buffer
    h, w = near_white.shape
    for corner in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        if flood.getpixel(corner) == 255:
            ImageDraw.floodfill(flood, corner, 128)
    # Grow by a few pixels to swallow the anti-aliased light halo on the edge.
    grown = Image.fromarray((np.asarray(flood) == 128).astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(7))
    return np.asarray(grown) > 0


def blur(values: np.ndarray, sigma: float) -> np.ndarray:
    """Separable Gaussian blur over the first two axes."""
    radius = int(3 * sigma)
    kernel = np.exp(-0.5 * (np.arange(-radius, radius + 1) / sigma) ** 2)
    kernel /= kernel.sum()
    pad = [(radius, radius), (radius, radius)] + [(0, 0)] * (values.ndim - 2)
    out = np.pad(values, pad, mode="edge")
    out = np.apply_along_axis(lambda v: np.convolve(v, kernel, mode="valid"), 0, out)
    return np.apply_along_axis(lambda v: np.convolve(v, kernel, mode="valid"), 1, out)


def extend_background(rgb: np.ndarray, outside: np.ndarray) -> np.ndarray:
    """Diffuses the navy background over the margin, following its gradient without seams."""
    r, b = rgb[..., 0].astype(int), rgb[..., 2].astype(int)
    navy = (b - r > 30) & (rgb.sum(axis=2) < 330) & ~outside  # excludes the black waistcoat
    step = 8  # diffuse at low resolution, then upsample
    h, w = outside.shape
    hs, ws = h // step, w // step
    small = lambda a: a[: hs * step, : ws * step].reshape(hs, step, ws, step, *a.shape[2:]).mean(axis=(1, 3))
    weight = small(navy.astype(float))
    colour = small(rgb.astype(float) * navy[..., None])
    fill = np.zeros((hs, ws, 3))
    done = np.zeros((hs, ws), bool)
    for sigma in (3, 6, 12, 24, 48):
        wb = blur(weight, sigma)
        ready = (wb > 0.05) & ~done
        fill[ready] = blur(colour, sigma)[ready] / wb[ready, None]
        done |= ready
    full = np.stack(
        [np.asarray(Image.fromarray(fill[..., c].astype(np.float32), "F").resize((w, h), Image.BILINEAR)) for c in range(3)],
        axis=2,
    )
    out = rgb.astype(float)
    out[outside] = full[outside]
    return out.clip(0, 255).astype(np.uint8)


def square_crop(image: Image.Image, inside: np.ndarray, pad: float = 0.0) -> Image.Image:
    ys, xs = np.where(inside)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    half = max(xs.max() - xs.min(), ys.max() - ys.min()) / 2 * (1 + pad)
    return image.crop((round(cx - half), round(cy - half), round(cx + half), round(cy + half)))


def save(image: Image.Image, name: str, size: int) -> None:
    image.resize((size, size), Image.LANCZOS).save(OUT / name, optimize=True)
    print("wrote", OUT / name)


def main() -> None:
    source = Image.open(SOURCE).convert("RGB")
    rgb = np.asarray(source)
    outside = outside_mask(rgb)
    inside = ~outside

    # Full bleed: corners filled with the extended navy background.
    bleed = Image.fromarray(extend_background(rgb, outside), "RGB")
    save(square_crop(bleed, inside), "icon.png", 1024)
    save(square_crop(bleed, inside), "favicon.png", 48)

    # Android adaptive icon: launchers show roughly the central 66%, so add an
    # extended-background margin that keeps Maurice's face and the roof visible.
    margin = 0.22
    pad = round(source.width * margin)
    padded = np.pad(rgb, ((pad, pad), (pad, pad), (0, 0)), mode="edge")
    padded_outside = np.pad(outside, pad, mode="constant", constant_values=True)
    adaptive = Image.fromarray(extend_background(padded, padded_outside), "RGB")
    inside_padded = np.pad(inside, pad, mode="constant", constant_values=False)
    save(square_crop(adaptive, inside_padded, pad=margin), "adaptive-icon.png", 1024)

    # Transparent corners for the README and in-app portrait.
    alpha = Image.fromarray((inside * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(1.2))
    rounded = source.copy()
    rounded.putalpha(alpha)
    save(square_crop(rounded, inside), "maurice.png", 512)


if __name__ == "__main__":
    main()
