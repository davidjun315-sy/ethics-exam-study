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
      "t": 1.91,
      "r": 0.0,
      "b": 0.21,
      "l": 0.0
    },
    "open": {
      "t": 7.23,
      "r": 6.25,
      "b": 6.17,
      "l": 6.25
    },
    "radius": 7.67,
    "aspect": 0.7489
  },
  "rare": {
    "out": {
      "t": 2.13,
      "r": 0.0,
      "b": 0.21,
      "l": 0.0
    },
    "open": {
      "t": 7.23,
      "r": 7.04,
      "b": 8.72,
      "l": 7.32
    },
    "radius": 7.32,
    "aspect": 0.7553
  },
  "epic": {
    "out": {
      "t": 3.83,
      "r": 0.0,
      "b": 1.7,
      "l": 0.28
    },
    "open": {
      "t": 11.28,
      "r": 7.65,
      "b": 9.57,
      "l": 7.65
    },
    "radius": 7.37,
    "aspect": 0.7511
  },
  "legendary": {
    "out": {
      "t": 4.47,
      "r": 0.28,
      "b": 1.91,
      "l": 0.28
    },
    "open": {
      "t": 10.64,
      "r": 7.93,
      "b": 11.06,
      "l": 7.93
    },
    "radius": 6.52,
    "aspect": 0.7511
  }
};
