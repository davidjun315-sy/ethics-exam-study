"""
카드 등급 프레임 만들기: 초록 배경(#00FF00) 위에 일반·희귀·영웅·전설 프레임 4개가 나란히 있는 이미지 →
  public/cards/frames/{common,rare,epic,legendary}.webp  (투명 배경)
  src/lib/game/frameGeometry.ts                          (프레임 몸통·안쪽 창·튀어나온 장식 위치, %)

사용: python3 -I scripts/build-card-frames.py <원본 이미지> [출력 너비 px, 기본 720] [테두리 두께 배율, 기본 1]
  두께 배율 0.7 = 테두리를 70% 두께로 (띠만 얇게 누르고, 위·아래 가운데 장식과 모서리는 비율을 지켜 함께 줄임)
새 프레임 이미지를 받으면 이 스크립트만 다시 돌리면 된다 (화면 코드는 frameGeometry.ts 를 읽음).
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

RARITIES = ["common", "rare", "epic", "legendary"]
ROOT = Path(__file__).resolve().parent.parent


def key_green(rgb: np.ndarray) -> np.ndarray:
    """초록 배경 → 투명. 초록이 얼마나 우세한지로 알파를 정하고, 가장자리의 초록 번짐을 지운다."""
    a = rgb.astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    dom = g - np.maximum(r, b)  # 배경 ≈ 245, 금속 ≤ 0
    alpha = np.clip((190.0 - dom) / 150.0, 0, 1)
    g2 = np.minimum(g, np.maximum(r, b))  # 초록 번짐 제거 (프레임에는 초록이 없음)
    out = np.dstack([r, g2, b, alpha * 255]).clip(0, 255).astype(np.uint8)
    return out


def segments(mask_1d: np.ndarray, min_len: int = 20):
    idx = np.where(mask_1d)[0]
    if not len(idx):
        return []
    segs, start, prev = [], idx[0], idx[0]
    for x in idx[1:]:
        if x != prev + 1:
            if prev - start >= min_len:
                segs.append((start, prev))
            start = x
        prev = x
    if prev - start >= min_len:
        segs.append((start, prev))
    return segs


def geometry(alpha: np.ndarray):
    """알파(0~1) → 몸통 사각형, 안쪽 창(%), 바깥으로 튀어나온 장식(%), 모서리 둥글기(%)"""
    h, w = alpha.shape
    solid = alpha > 0.5
    row_cov = solid.mean(axis=1)
    col_cov = solid.mean(axis=0)
    rows = np.where(row_cov > 0.6)[0]
    cols = np.where(col_cov > 0.6)[0]
    bt, bb, bl, br = rows[0], rows[-1], cols[0], cols[-1]
    bw, bh = br - bl + 1, bb - bt + 1

    def scan(line: np.ndarray) -> int:
        # 몸통 가장자리에서 안쪽으로: 불투명이 끝나는 첫 지점
        i = 0
        while i < len(line) and not line[i]:
            i += 1
        while i < len(line) and line[i]:
            i += 1
        return i

    ys = [bt + int(bh * f) for f in (0.3, 0.5, 0.7)]
    xs = [bl + int(bw * f) for f in (0.3, 0.5, 0.7)]
    left = max(scan(solid[y, bl : br + 1]) for y in ys)
    right = max(scan(solid[y, bl : br + 1][::-1]) for y in ys)
    top = max(scan(solid[bt : bb + 1, x]) for x in xs)
    bottom = max(scan(solid[bt : bb + 1, x][::-1]) for x in xs)
    # 모서리 둥글기: 몸통 첫 줄에서 처음 불투명까지
    radius = int(np.argmax(solid[bt + 1, bl : br + 1]))

    pct = lambda v, d: round(100.0 * v / d, 2)
    return {
        "box": (bt, bb, bl, br),
        "out": {"t": pct(bt, bh), "r": pct(w - 1 - br, bw), "b": pct(h - 1 - bb, bh), "l": pct(bl, bw)},
        "open": {"t": pct(top, bh), "r": pct(right, bw), "b": pct(bottom, bh), "l": pct(left, bw)},
        "radius": pct(max(radius, 4), bw),
        "aspect": round(bw / bh, 4),
    }


def resize_np(a: np.ndarray, w: int, h: int) -> np.ndarray:
    return np.asarray(Image.fromarray(a, "RGBA").resize((max(1, w), max(1, h)), Image.LANCZOS))


def squeeze_axis(a: np.ndarray, lo: int, hi: int, k: float, axis: int) -> np.ndarray:
    """axis 방향으로 [0,lo) 와 [hi,끝) 띠를 k 배로 누른다 (가운데는 그대로)"""
    if axis == 1:
        return squeeze_axis(a.transpose(1, 0, 2), lo, hi, k, 0).transpose(1, 0, 2)
    n, w = a.shape[0], a.shape[1]
    top, mid, bot = a[:lo], a[lo:hi], a[hi:]
    top = resize_np(top, w, round(lo * k))
    bot = resize_np(bot, w, round((n - hi) * k))
    return np.concatenate([top, mid, bot], axis=0)


def thin_frame(piece: np.ndarray, k: float) -> np.ndarray:
    """테두리 띠를 k 배 두께로. 위·아래 가운데 장식(신전·보석)은 같은 비율로 줄여 다시 붙인다"""
    if k >= 0.999:
        return piece
    alpha = piece[..., 3] / 255.0
    g = geometry(alpha)
    bt, bb, bl, br = g["box"]
    bh, bw = bb - bt + 1, br - bl + 1
    h, w = alpha.shape
    # 안쪽 창 경계 (px)
    ot = bt + round(g["open"]["t"] * bh / 100)
    ob = bb - round(g["open"]["b"] * bh / 100)
    ol = bl + round(g["open"]["l"] * bw / 100)
    orr = br - round(g["open"]["r"] * bw / 100)
    base = squeeze_axis(piece, ot, ob + 1, k, 0)
    base = squeeze_axis(base, ol, orr + 1, k, 1)
    nh, nw = base.shape[:2]
    x0, x1 = round(w * 0.15), round(w * 0.85)  # 가운데 장식 띠 (양끝은 장식 없는 금속)
    sx0 = round(x0 * k) if x0 < ol else x0 - (ol - round(ol * k))
    out = base.copy().astype(np.float32)

    def paste(src: np.ndarray, top: int):
        # 원본 띠를 k 배로 (비율 유지) 줄여 가운데에 붙이고, 양끝은 부드럽게 섞는다
        sh, sw = src.shape[:2]
        small = resize_np(src, round(sw * k), round(sh * k)).astype(np.float32)
        th, tw = small.shape[:2]
        cx = (sx0 + (sx0 + (x1 - x0))) // 2 - tw // 2
        cx = (nw - tw) // 2
        feather = max(2, tw // 12)
        ramp = np.ones(tw, np.float32)
        ramp[:feather] = np.linspace(0, 1, feather)
        ramp[-feather:] = np.linspace(1, 0, feather)
        m = ramp[None, :, None]
        region = out[top : top + th, cx : cx + tw]
        th2 = region.shape[0]
        out[top : top + th2, cx : cx + tw] = region * (1 - m) + small[:th2] * m

    paste(piece[: ot, x0:x1], 0)
    bot_src = piece[ob + 1 :, x0:x1]
    paste(bot_src, nh - round(bot_src.shape[0] * k))
    return out.clip(0, 255).astype(np.uint8)


def main():
    src = Path(sys.argv[1])
    width = int(sys.argv[2]) if len(sys.argv) > 2 else 720
    thin = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
    rgba = key_green(np.asarray(Image.open(src).convert("RGB")))
    alpha = rgba[..., 3] / 255.0
    segs = segments((alpha > 0.5).sum(axis=0) > 5)
    if len(segs) != 4:
        sys.exit(f"프레임 4개를 찾지 못했습니다 (찾은 개수 {len(segs)}). 초록 배경 위에 4개가 떨어져 있어야 합니다.")
    out_dir = ROOT / "public" / "cards" / "frames"
    out_dir.mkdir(parents=True, exist_ok=True)
    geo = {}
    for rarity, (x0, x1) in zip(RARITIES, segs):
        col = alpha[:, x0 : x1 + 1]
        ys = np.where((col > 0.05).sum(axis=1) > 0)[0]
        piece = thin_frame(rgba[ys[0] : ys[-1] + 1, x0 : x1 + 1], thin)
        g = geometry(piece[..., 3] / 255.0)
        img = Image.fromarray(piece, "RGBA")
        scale = width / img.width
        img = img.resize((width, round(img.height * scale)), Image.LANCZOS)
        if scale > 1.2:
            img = img.filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))
        img.save(out_dir / f"{rarity}.webp", "WEBP", quality=88, method=6)
        geo[rarity] = {k: v for k, v in g.items() if k != "box"}
        print(rarity, (out_dir / f"{rarity}.webp").stat().st_size // 1024, "KB", geo[rarity])
    ts = (
        "// 자동 생성: scripts/build-card-frames.py (직접 고치지 말고 스크립트를 다시 실행)\n"
        "// out = 몸통 바깥으로 튀어나온 장식, open = 안쪽 창까지의 테두리 두께, radius = 몸통 모서리 (모두 몸통 크기 대비 %)\n"
        'import type { Rarity } from "./rules";\n\n'
        "export interface FrameGeometry {\n  out: { t: number; r: number; b: number; l: number };\n  open: { t: number; r: number; b: number; l: number };\n  radius: number;\n  aspect: number;\n}\n\n"
        f"export const FRAME_GEOMETRY: Record<Rarity, FrameGeometry> = {json.dumps(geo, indent=2)};\n"
    )
    (ROOT / "src" / "lib" / "game" / "frameGeometry.ts").write_text(ts)


if __name__ == "__main__":
    main()
