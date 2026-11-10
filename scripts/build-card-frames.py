"""
카드 등급 프레임 만들기: 초록 배경(#00FF00) 위에 일반·희귀·영웅·전설 프레임 4개가 나란히 있는 이미지 →
  public/cards/frames/{common,rare,epic,legendary}.webp  (투명 배경)
  src/lib/game/frameGeometry.ts                          (프레임 몸통·안쪽 창·튀어나온 장식 위치, %)

사용: python3 -I scripts/build-card-frames.py <원본 이미지> [출력 너비 px, 기본 720]
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


def main():
    src = Path(sys.argv[1])
    width = int(sys.argv[2]) if len(sys.argv) > 2 else 720
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
        piece = rgba[ys[0] : ys[-1] + 1, x0 : x1 + 1]
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
