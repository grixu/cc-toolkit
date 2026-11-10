"""Writes every cc-toolkit logo asset: SVG sources, then PNG/ICO rasters rendered by headless Chrome.

Run from the repo root: uv run --with fonttools python3 brand/logo/src/build.py
Needs Google Chrome and ImageMagick (`magick`) on the machine.
"""
import math
import re
import subprocess
import tempfile
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT.parent / "fonts"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def oklch_hex(L, C, H):
    a, b = C * math.cos(math.radians(H)), C * math.sin(math.radians(H))
    l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s_ = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    lin = (4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
           -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
           -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_)
    if any(v < -1e-4 or v > 1 + 1e-4 for v in lin):
        raise ValueError(f"oklch({L} {C} {H}) is outside sRGB")
    enc = lambda v: 12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055
    return "#" + "".join(f"{round(min(1, max(0, enc(v))) * 255):02X}" for v in lin)


def ceiling(L, H):
    c = 0.0
    while c < 0.4:
        try:
            oklch_hex(L, c + 0.002, H)
        except ValueError:
            break
        c += 0.002
    return c


def ramp(top, left, right, H, frac):
    """Three faces of one hue, lit from the upper left; chroma is `frac` of each lightness's sRGB ceiling."""
    return {k: (L, round(ceiling(L, H) * frac, 3), H) for k, L in (("top", top), ("left", left), ("right", right))}


# Bottle green. On dark the structure steps down and the green steps up, so the front plate separates by
# lightness and not by hue alone; on paper both ramps are remapped, not repainted.
PALETTE = {
    "dark": dict(ground=(0.17, 0.015, 160), stone=ramp(0.76, 0.6, 0.46, 140, 0.1),
                 accent=ramp(0.8, 0.68, 0.56, 158, 0.62), ink=(0.93, 0.008, 140), muted=(0.68, 0.012, 140)),
    "light": dict(ground=(0.965, 0.008, 120), stone=ramp(0.84, 0.66, 0.5, 140, 0.1),
                  accent=ramp(0.5, 0.4, 0.31, 160, 0.7), ink=(0.24, 0.012, 150), muted=(0.46, 0.012, 150)),
}


def hexes(ground):
    p = PALETTE[ground]
    return {
        "ground": oklch_hex(*p["ground"]), "ink": oklch_hex(*p["ink"]), "muted": oklch_hex(*p["muted"]),
        "stone": {k: oklch_hex(*v) for k, v in p["stone"].items()},
        "accent": {k: oklch_hex(*v) for k, v in p["accent"].items()},
    }


COS, SIN = math.cos(math.radians(30)), math.sin(math.radians(30))
PLATE_T, PLATE_GAP, PLATE_SIDE, PLATES = 1.6, 2.2, 10, 4


def project(x, y, z):
    return ((x - y) * COS, (x + y) * SIN - z)


def mark_faces():
    """(role, face, polygon) for the four plates, back to front: +x is towards the viewer."""
    out = []
    for k in range(PLATES):
        x0, x1, s = k * (PLATE_T + PLATE_GAP), k * (PLATE_T + PLATE_GAP) + PLATE_T, PLATE_SIDE
        role = "accent" if k == PLATES - 1 else "stone"
        for face, pts in (("top", [(x0, 0, s), (x1, 0, s), (x1, s, s), (x0, s, s)]),
                          ("right", [(x1, 0, 0), (x1, s, 0), (x1, s, s), (x1, 0, s)]),
                          ("left", [(x0, s, 0), (x1, s, 0), (x1, s, s), (x0, s, s)])):
            out.append((role, face, [project(*p) for p in pts]))
    return out


FACES = mark_faces()
_xs = [x for *_, r in FACES for x, _ in r]
_ys = [y for *_, r in FACES for _, y in r]
MARK_BOX = (min(_xs), min(_ys), max(_xs) - min(_xs), max(_ys) - min(_ys))
MARK_RATIO = MARK_BOX[2] / MARK_BOX[3]


def _d(ring, k, x, y):
    return "M" + " L".join(f"{(px - MARK_BOX[0]) * k + x:.2f},{(py - MARK_BOX[1]) * k + y:.2f}" for px, py in ring) + "Z"


def mark(ground, height, x=0.0, y=0.0):
    """The mark, `height` tall, with its box's top-left at (x, y)."""
    c, k = hexes(ground), height / MARK_BOX[3]
    # A same-colour hairline stroke closes the antialiasing seams between adjacent faces.
    sw = height / 200
    return [f'<path d="{_d(r, k, x, y)}" fill="{c[role][face]}" stroke="{c[role][face]}" '
            f'stroke-width="{sw:.2f}" stroke-linejoin="round"/>' for role, face, r in FACES]


def mark_classed(height):
    """The mark with one class per face colour, for the favicon that follows the colour scheme."""
    k = height / MARK_BOX[3]
    return [f'<path class="{role[0]}{face[0]}" d="{_d(r, k, 0, 0)}"/>' for role, face, r in FACES]


def mark_mono(fill, height, mask_id):
    """One colour: every face boundary is a knocked-out gap, so the form survives without shading."""
    k, gap = height / MARK_BOX[3], height * 0.022
    w = MARK_BOX[2] * k
    layers = "".join(f'<path d="{_d(r, k, 0, 0)}" fill="#fff" stroke="#000" stroke-width="{gap:.2f}" '
                     f'stroke-linejoin="round"/>' for *_, r in FACES)
    return [f'<mask id="{mask_id}" maskUnits="userSpaceOnUse" x="0" y="0" width="{w:.2f}" height="{height:.2f}">'
            f'<rect width="{w:.2f}" height="{height:.2f}"/>{layers}</mask>',
            f'<rect width="{w:.2f}" height="{height:.2f}" fill="{fill}" mask="url(#{mask_id})"/>']



class Face:
    def __init__(self, file):
        self.font = TTFont(FONTS / file)
        self.upm = self.font["head"].unitsPerEm
        self.glyphs = self.font.getGlyphSet()
        self.cmap = self.font.getBestCmap()
        self.x_height = self.font["OS/2"].sxHeight / self.upm

    def width(self, text, size):
        return sum(self.glyphs[self.cmap[ord(ch)]].width for ch in text) * size / self.upm

    def paths(self, text, size, x, baseline, fill, accents=None):
        """Outlined text; `accents` maps a character index to its own fill."""
        s, cursor, out = size / self.upm, 0, []
        for i, ch in enumerate(text):
            g = self.cmap[ord(ch)]
            pen = SVGPathPen(self.glyphs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
            self.glyphs[g].draw(TransformPen(pen, (s, 0, 0, -s, x + cursor * s, baseline)))
            if pen.getCommands():
                out.append(f'<path d="{pen.getCommands()}" fill="{(accents or {}).get(i, fill)}"/>')
            cursor += self.glyphs[g].width
        return out


WORD = Face("ChakraPetch-SemiBold.ttf")
TEXT = Face("ChakraPetch-Regular.ttf")
NAME, HYPHEN = "cc-toolkit", 2

# Lockup proportions, relative to the mark's height. Horizontal: x-height 0.33, gap 0.28, the word centred
# optically on its x-height. Vertical: x-height 0.22, baseline 1.2 mark heights + 0.75 type sizes down.
H_XH, H_GAP = 0.33, 0.28
V_XH, V_DROP = 0.22, 1.2


def word(ground, size, x, baseline, mono=None):
    if mono:
        return WORD.paths(NAME, size, x, baseline, mono)
    c = hexes(ground)
    return WORD.paths(NAME, size, x, baseline, c["ink"], {HYPHEN: c["accent"]["left"]})


def svg(w, h, body, bg=None):
    rect = [f'<rect width="{w:.0f}" height="{h:.0f}" fill="{bg}"/>'] if bg else []
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.0f}" height="{h:.0f}" viewBox="0 0 {w:.2f} {h:.2f}">\n'
            + "\n".join(rect + body) + "\n</svg>\n")


def lockup(ground, mark_h, x=0.0, y=0.0, mono=None):
    """Horizontal lockup at (x, y). Returns (elements, width, height)."""
    size = mark_h * H_XH / WORD.x_height
    mw = mark_h * MARK_RATIO
    body = mark_mono(mono, mark_h, "h") if mono else mark(ground, mark_h)
    if mono or x or y:
        body = [f'<g transform="translate({x:.2f} {y:.2f})">'] + body + ["</g>"]
    tx = x + mw + mark_h * H_GAP
    baseline = y + mark_h / 2 + mark_h * H_XH / 2
    return body + word(ground, size, tx, baseline, mono), mw + mark_h * H_GAP + WORD.width(NAME, size), mark_h


def lockup_vertical(ground, mark_h, mono=None):
    size = mark_h * V_XH / WORD.x_height
    mw, ww = mark_h * MARK_RATIO, WORD.width(NAME, size)
    w = max(mw, ww)
    baseline = mark_h * V_DROP + size * 0.75
    m = mark_mono(mono, mark_h, "v") if mono else mark(ground, mark_h)
    body = [f'<g transform="translate({(w - mw) / 2:.2f} 0)">'] + m + ["</g>"]
    return body + word(ground, size, (w - ww) / 2, baseline, mono), w, baseline + size * 0.05


def tile(ground, side, fill, radius=0.0):
    """Square tile with the mark's width at `fill` of the side, centred."""
    mh = side * fill / MARK_RATIO
    return [f'<rect width="{side}" height="{side}" rx="{side * radius:.2f}" fill="{hexes(ground)["ground"]}"/>'] + \
        mark(ground, mh, (side - mh * MARK_RATIO) / 2, (side - mh) / 2)


TAGLINE = "Claude Code plugins for the AI-driven development lifecycle."
REPO = "github.com/grixu/cc-toolkit"


def banner(w, h, mark_h, right_align):
    """Lockup over the tagline. Right-aligned for headers, where the profile photo covers the left."""
    c = hexes("dark")
    _, lw, lh = lockup("dark", mark_h)
    ts = mark_h * 0.27
    tw = TEXT.width(TAGLINE, ts)
    block_w, block_h = max(lw, tw), lh + ts * 1.9
    x = w - block_w - h * 0.22 if right_align else (w - block_w) / 2
    y = (h - block_h) / 2
    body, *_ = lockup("dark", mark_h, x, y)
    return [f'<rect width="{w}" height="{h}" fill="{c["ground"]}"/>'] + body + \
        TEXT.paths(TAGLINE, ts, x, y + lh + ts * 1.65, c["muted"])


def og():
    w, h, c = 1200, 630, hexes("dark")
    body = [f'<rect width="{w}" height="{h}" fill="{c["ground"]}"/>']
    big = 330
    body += mark("dark", big, w - 96 - big * MARK_RATIO, (h - big) / 2)
    lk, _, lh = lockup("dark", 64, 96, 150)
    body += lk
    ts = 34
    for i, line in enumerate(("Claude Code plugins for the", "AI-driven development lifecycle.")):
        body += TEXT.paths(line, ts, 96, 150 + lh + 92 + i * ts * 1.35, c["ink"])
    body += TEXT.paths(REPO, 22, 96, h - 96, c["muted"])
    return svg(w, h, body)


def post():
    side, c = 1080, hexes("dark")
    body, lw, lh = lockup_vertical("dark", 360)
    x, y = (side - lw) / 2, (side - lh) / 2 - 30
    out = [f'<rect width="{side}" height="{side}" fill="{c["ground"]}"/>', f'<g transform="translate({x:.2f} {y:.2f})">'] + body + ["</g>"]
    out += TEXT.paths(REPO, 26, (side - TEXT.width(REPO, 26)) / 2, side - 88, c["muted"])
    return svg(side, side, out)


def favicon_svg():
    side = 64
    mh = side / MARK_RATIO
    rules = lambda g: " ".join(f".{r[0]}{f[0]}{{fill:{hexes(g)[r][f]}}}" for r in ("stone", "accent") for f in ("top", "left", "right"))
    style = f"<style>{rules('light')} @media (prefers-color-scheme: dark) {{ {rules('dark')} }}</style>"
    return svg(side, side, [style, f'<g transform="translate(0 {(side - mh) / 2:.2f})">'] + mark_classed(mh) + ["</g>"])



def write(rel, text):
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    return path


def render(src, out, w, h):
    """Rasterise an SVG at w×h with headless Chrome, keeping transparency."""
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / "page.html"
        page.write_text(f'<!doctype html><style>html,body{{margin:0;background:transparent}}img{{display:block}}</style>'
                        f'<img src="{src.as_uri()}" width="{w}" height="{h}">')
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
                        "--force-device-scale-factor=1", "--default-background-color=00000000",
                        f"--window-size={w},{h}", f"--screenshot={out}", page.as_uri()],
                       check=True, capture_output=True)


def downscale(src, out, side):
    subprocess.run(["magick", str(src), "-filter", "Triangle", "-resize", f"{side}x{side}", str(out)], check=True)


def main():
    files = {}
    # Lockups are drawn at mark height 120; the vertical one at 160.
    for ground in ("dark", "light"):
        tag = f"on-{ground}"
        mh = 120
        files[f"svg/mark-{tag}.svg"] = svg(mh * MARK_RATIO, mh, mark(ground, mh))
        body, w, h = lockup(ground, mh)
        files[f"svg/lockup-{tag}.svg"] = svg(w, h, body)
        body, w, h = lockup_vertical(ground, 160)
        files[f"svg/lockup-vertical-{tag}.svg"] = svg(w, h, body)
        size = 100
        files[f"svg/wordmark-{tag}.svg"] = svg(WORD.width(NAME, size), size * 0.8,
                                                word(ground, size, 0, size * 0.8 - size * 0.02))
    for name, fill in (("ink", hexes("light")["ink"]), ("white", "#FFFFFF")):
        mh = 120
        files[f"svg/mark-mono-{name}.svg"] = svg(mh * MARK_RATIO, mh, mark_mono(fill, mh, "m"))
        body, w, h = lockup(None, mh, mono=fill)
        files[f"svg/lockup-mono-{name}.svg"] = svg(w, h, body)

    files["icons/favicon.svg"] = favicon_svg()
    files["icons/icon.svg"] = svg(512, 512, tile("dark", 512, 0.62))
    files["icons/icon-maskable.svg"] = svg(512, 512, tile("dark", 512, 0.5))
    files["social/avatar.svg"] = svg(400, 400, tile("dark", 400, 0.62))
    files["social/avatar-on-light.svg"] = svg(400, 400, tile("light", 400, 0.62))
    files["social/x-header.svg"] = svg(1500, 500, banner(1500, 500, 150, True))
    files["social/linkedin-banner.svg"] = svg(1584, 396, banner(1584, 396, 120, True))
    files["social/og.svg"] = og()
    files["social/post-square.svg"] = post()
    paths = {rel: write(rel, text) for rel, text in files.items()}

    # Raster favicons sit on a dark tile: no single transparent ramp keeps the front plate visible on both
    # light and dark tabs, and an ICO can't follow the colour scheme the way favicon.svg does.
    for rel in [r for r in files if r.startswith("svg/")]:
        src = paths[rel]
        w, h = (float(v) for v in re.search(r'width="([\d.]+)" height="([\d.]+)"', files[rel]).groups())
        k = 1024 / h if rel.startswith("svg/mark") else 4
        render(src, ROOT / "png" / (Path(rel).stem + ".png"), round(w * k), round(h * k))
    with tempfile.TemporaryDirectory() as tmp:
        fav = Path(tmp) / "fav.svg"
        fav.write_text(svg(64, 64, tile("dark", 64, 0.8, radius=0.2)))
        big = Path(tmp) / "fav-512.png"
        render(fav, big, 512, 512)
        for s in (16, 32, 48):
            downscale(big, ROOT / f"icons/favicon-{s}.png", s)
        subprocess.run(["magick"] + [str(ROOT / f"icons/favicon-{s}.png") for s in (16, 32, 48)]
                       + [str(ROOT / "icons/favicon.ico")], check=True)
    render(paths["icons/icon.svg"], ROOT / "icons/icon-512.png", 512, 512)
    downscale(ROOT / "icons/icon-512.png", ROOT / "icons/icon-192.png", 192)
    downscale(ROOT / "icons/icon-512.png", ROOT / "icons/apple-touch-icon.png", 180)
    render(paths["icons/icon-maskable.svg"], ROOT / "icons/icon-maskable-512.png", 512, 512)
    for name, (w, h) in {"avatar": (400, 400), "avatar-on-light": (400, 400), "x-header": (1500, 500),
                         "linkedin-banner": (1584, 396), "og": (1200, 630), "post-square": (1080, 1080)}.items():
        render(paths[f"social/{name}.svg"], ROOT / f"social/{name}.png", w, h)

    for g in ("dark", "light"):
        c = hexes(g)
        print(g, "ground", c["ground"], "ink", c["ink"], "muted", c["muted"])
        for role in ("stone", "accent"):
            print(" ", role, {f: (f"oklch({L:g} {C:g} {H:g})", c[role][f]) for f, (L, C, H) in PALETTE[g][role].items()})
    print(len(files), "svg files")


if __name__ == "__main__":
    main()
