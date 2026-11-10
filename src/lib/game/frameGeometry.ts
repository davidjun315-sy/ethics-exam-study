// 자동 생성: scripts/build-card-frames.py (직접 고치지 말고 스크립트를 다시 실행)
// out = 몸통 바깥으로 튀어나온 장식, open = 안쪽 창까지의 테두리 두께, radius = 몸통 모서리 (모두 몸통 크기 대비 %)
import type { Rarity } from "./rules";

export interface FrameGeometry {
  out: { t: number; r: number; b: number; l: number };
  open: { t: number; r: number; b: number; l: number };
  radius: number;
  aspect: number;
}

export const FRAME_GEOMETRY: Record<Rarity, FrameGeometry> = {
  "common": {
    "out": {
      "t": 1.33,
      "r": 0.0,
      "b": 0.0,
      "l": 0.0
    },
    "open": {
      "t": 5.31,
      "r": 4.44,
      "b": 4.65,
      "l": 4.44
    },
    "radius": 5.62,
    "aspect": 0.7478
  },
  "rare": {
    "out": {
      "t": 1.56,
      "r": 0.0,
      "b": 0.0,
      "l": 0.0
    },
    "open": {
      "t": 5.36,
      "r": 5.29,
      "b": 6.7,
      "l": 5.29
    },
    "radius": 5.0,
    "aspect": 0.7589
  },
  "epic": {
    "out": {
      "t": 2.71,
      "r": 0.0,
      "b": 1.13,
      "l": 0.0
    },
    "open": {
      "t": 8.6,
      "r": 5.62,
      "b": 7.24,
      "l": 5.92
    },
    "radius": 5.92,
    "aspect": 0.7647
  },
  "legendary": {
    "out": {
      "t": 3.17,
      "r": 0.3,
      "b": 1.36,
      "l": 0.0
    },
    "open": {
      "t": 8.16,
      "r": 5.65,
      "b": 8.16,
      "l": 5.95
    },
    "radius": 5.06,
    "aspect": 0.7619
  }
};
