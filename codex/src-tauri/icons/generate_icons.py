#!/usr/bin/env python3
"""
Generate Codex app icons for Tauri.
Minimalist dark circle with gradient code brackets "</>" symbol.
"""

import math
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ICON_DIR = "/Users/imdigitalashish/Projects/AshishKumarVerm/RandomShitFromClaude/codexforwindows/codex/src-tauri/icons"
SIZE = 1024  # Render at high res then downscale for quality

# Colors
BG_DARK = (10, 10, 10, 255)        # #0a0a0a
GRADIENT_GREEN = (16, 185, 129)     # #10b981
GRADIENT_INDIGO = (99, 102, 241)    # #6366f1
TRANSPARENT = (0, 0, 0, 0)


def lerp_color(c1, c2, t):
    """Linearly interpolate between two RGB tuples."""
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))


def create_gradient_mask(size, direction="horizontal"):
    """Create a gradient image going from left (green) to right (indigo)."""
    gradient = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pixels = gradient.load()
    for x in range(size):
        t = x / (size - 1) if size > 1 else 0
        color = lerp_color(GRADIENT_GREEN, GRADIENT_INDIGO, t)
        for y in range(size):
            pixels[x, y] = (*color, 255)
    return gradient


def create_base_icon(size=1024):
    """Create the base icon at the given size."""
    img = Image.new("RGBA", (size, size), TRANSPARENT)
    draw = ImageDraw.Draw(img)

    # --- Draw dark circle background ---
    margin = int(size * 0.02)
    draw.ellipse([margin, margin, size - margin, size - margin], fill=BG_DARK)

    # --- Gradient ring around the circle ---
    cx, cy = size // 2, size // 2
    ring_width = max(int(size * 0.014), 2)
    radius_outer = (size // 2) - margin
    radius_inner = radius_outer - ring_width

    ring_mask = Image.new("L", (size, size), 0)
    ring_draw = ImageDraw.Draw(ring_mask)
    ring_draw.ellipse(
        [cx - radius_outer, cy - radius_outer, cx + radius_outer, cy + radius_outer],
        fill=255,
    )
    ring_draw.ellipse(
        [cx - radius_inner, cy - radius_inner, cx + radius_inner, cy + radius_inner],
        fill=0,
    )

    gradient_layer = create_gradient_mask(size)
    ring_layer = Image.new("RGBA", (size, size), TRANSPARENT)
    ring_layer.paste(gradient_layer, mask=ring_mask)

    # Make the ring semi-transparent for subtlety
    ring_alpha = ring_layer.split()[3]
    ring_alpha = ring_alpha.point(lambda p: int(p * 0.7))
    ring_layer.putalpha(ring_alpha)

    img = Image.alpha_composite(img, ring_layer)

    # --- Draw code brackets "</>" with gradient ---
    symbol_layer = Image.new("L", (size, size), 0)
    symbol_draw = ImageDraw.Draw(symbol_layer)

    # Try to find a good monospace/bold font
    font = None
    font_size = int(size * 0.36)
    font_paths = [
        "/System/Library/Fonts/SFMono-Bold.otf",
        "/System/Library/Fonts/Menlo.ttc",
        "/System/Library/Fonts/Monaco.dfont",
        "/System/Library/Fonts/Supplemental/Courier New Bold.ttf",
        "/System/Library/Fonts/Courier.dfont",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
    ]
    for fp in font_paths:
        try:
            font = ImageFont.truetype(fp, font_size)
            break
        except (IOError, OSError):
            continue

    if font is None:
        font = ImageFont.load_default()

    symbol = "</>"

    # Center the text
    bbox = symbol_draw.textbbox((0, 0), symbol, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    text_x = (size - text_w) // 2 - bbox[0]
    text_y = (size - text_h) // 2 - bbox[1]

    symbol_draw.text((text_x, text_y), symbol, fill=255, font=font)

    # Thicken the text slightly for small-size readability
    symbol_layer = symbol_layer.filter(ImageFilter.MaxFilter(3))

    # Apply gradient to the symbol
    gradient_full = create_gradient_mask(size)
    symbol_colored = Image.new("RGBA", (size, size), TRANSPARENT)
    symbol_colored.paste(gradient_full, mask=symbol_layer)

    # --- Add a glow behind the text ---
    glow_mask = symbol_layer.copy()
    for _ in range(8):
        glow_mask = glow_mask.filter(ImageFilter.GaussianBlur(radius=10))

    mid_color = lerp_color(GRADIENT_GREEN, GRADIENT_INDIGO, 0.5)
    glow_solid = Image.new("RGBA", (size, size), (*mid_color, 35))
    glow_layer = Image.new("RGBA", (size, size), TRANSPARENT)
    glow_layer.paste(glow_solid, mask=glow_mask)

    img = Image.alpha_composite(img, glow_layer)
    img = Image.alpha_composite(img, symbol_colored)

    return img


def save_png(img, path, target_size):
    """Resize and save as RGBA PNG."""
    resized = img.resize((target_size, target_size), Image.LANCZOS)
    if resized.mode != "RGBA":
        resized = resized.convert("RGBA")
    resized.save(path, "PNG")
    print(f"  Saved: {path} ({target_size}x{target_size}, RGBA)")
    return resized


def create_icns(img, path):
    """Create macOS .icns file."""
    largest = img.resize((1024, 1024), Image.LANCZOS).convert("RGBA")
    largest.save(path, format="ICNS")
    print(f"  Saved: {path} (ICNS)")


def create_ico(img, path):
    """Create Windows .ico file with multiple sizes."""
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    frames = []
    for s in ico_sizes:
        frame = img.resize((s, s), Image.LANCZOS).convert("RGBA")
        frames.append(frame)

    frames[0].save(
        path,
        format="ICO",
        sizes=[(s, s) for s in ico_sizes],
        append_images=frames[1:],
    )
    print(f"  Saved: {path} (ICO with sizes: {ico_sizes})")


def main():
    print("=" * 60)
    print("  Generating Codex App Icons")
    print("=" * 60)
    print(f"Output: {ICON_DIR}\n")

    # Create base high-res icon
    print("[1/5] Creating base icon (1024x1024)...")
    base = create_base_icon(SIZE)
    assert base.mode == "RGBA", f"Expected RGBA, got {base.mode}"
    print(f"       Mode: {base.mode}, Size: {base.size}\n")

    # Save PNG variants
    print("[2/5] Saving 32x32.png...")
    save_png(base, os.path.join(ICON_DIR, "32x32.png"), 32)

    print("[3/5] Saving 128x128.png and 128x128@2x.png...")
    save_png(base, os.path.join(ICON_DIR, "128x128.png"), 128)
    save_png(base, os.path.join(ICON_DIR, "128x128@2x.png"), 256)

    # Save macOS ICNS
    print("\n[4/5] Creating macOS icon.icns...")
    create_icns(base, os.path.join(ICON_DIR, "icon.icns"))

    # Save Windows ICO
    print("\n[5/5] Creating Windows icon.ico...")
    create_ico(base, os.path.join(ICON_DIR, "icon.ico"))

    # Also save a 512x512 reference
    print("\n[bonus] Saving icon.png (512x512 reference)...")
    save_png(base, os.path.join(ICON_DIR, "icon.png"), 512)

    # Verification
    print("\n" + "=" * 60)
    print("  Verification")
    print("=" * 60)
    for fname in ["32x32.png", "128x128.png", "128x128@2x.png", "icon.png"]:
        fpath = os.path.join(ICON_DIR, fname)
        verify = Image.open(fpath)
        status = "OK" if verify.mode == "RGBA" else "FAIL"
        print(f"  [{status}] {fname}: mode={verify.mode}, size={verify.size}")
        assert verify.mode == "RGBA", f"{fname} is not RGBA!"

    for fname in ["icon.icns", "icon.ico"]:
        fpath = os.path.join(ICON_DIR, fname)
        fsize = os.path.getsize(fpath)
        print(f"  [OK] {fname}: {fsize:,} bytes")

    print("\nAll icons generated successfully!")


if __name__ == "__main__":
    main()
