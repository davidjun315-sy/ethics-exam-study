/**
 * 초록 배경(#00FF00) 그림 → 투명 배경 (브라우저에서). 전투 캐릭터 올리기용.
 *  - 초록이 얼마나 우세한지로 알파를 정하고, 가장자리의 초록 번짐을 지운다 (scripts/build-card-frames.py 와 같은 방식)
 *  - 그림이 있는 부분만 잘라 내고, 너무 크면 줄인다
 *  - flip: 왼쪽을 보는 그림이면 좌우를 뒤집어 '오른쪽을 보는 그림'으로 저장
 */
export async function keyGreen(file: Blob, opts: { maxHeight?: number; flip?: boolean } = {}): Promise<{ blob: Blob; ext: "webp" | "png"; width: number; height: number; greenShare: number }> {
  const maxHeight = opts.maxHeight ?? 720;
  const bmp = await createImageBitmap(file);
  const src = document.createElement("canvas");
  src.width = bmp.width;
  src.height = bmp.height;
  const sctx = src.getContext("2d", { willReadFrequently: true })!;
  if (opts.flip) {
    sctx.translate(bmp.width, 0);
    sctx.scale(-1, 1);
  }
  sctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  const img = sctx.getImageData(0, 0, src.width, src.height);
  const d = img.data;
  let minX = src.width,
    minY = src.height,
    maxX = -1,
    maxY = -1,
    green = 0;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const i = (y * src.width + x) * 4;
      const r = d[i],
        g = d[i + 1],
        b = d[i + 2];
      const mx = Math.max(r, b);
      const dom = g - mx; // 배경 ≈ 245, 그림 ≤ 0
      const a = Math.max(0, Math.min(1, (190 - dom) / 150));
      if (a < 0.05) green++;
      // 초록 번짐 제거
      if (g > mx) d[i + 1] = mx;
      d[i + 3] = Math.round(a * d[i + 3]);
      if (d[i + 3] > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error("그림을 찾지 못했습니다. 초록 배경 위의 캐릭터 그림인지 확인하세요.");
  sctx.putImageData(img, 0, 0);
  const pad = 4;
  const cx = Math.max(0, minX - pad),
    cy = Math.max(0, minY - pad);
  const cw = Math.min(src.width, maxX + pad + 1) - cx,
    ch = Math.min(src.height, maxY + pad + 1) - cy;
  const scale = Math.min(1, maxHeight / ch);
  const out = document.createElement("canvas");
  out.width = Math.round(cw * scale);
  out.height = Math.round(ch * scale);
  const octx = out.getContext("2d")!;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(src, cx, cy, cw, ch, 0, 0, out.width, out.height);
  const toBlob = (type: string, q?: number) => new Promise<Blob | null>((res) => out.toBlob(res, type, q));
  const webp = await toBlob("image/webp", 0.9);
  // 일부 브라우저는 webp 를 못 만들어 png 로 돌려줌
  if (webp && webp.type === "image/webp") return { blob: webp, ext: "webp", width: out.width, height: out.height, greenShare: green / (src.width * src.height) };
  const png = await toBlob("image/png");
  if (!png) throw new Error("그림을 만들지 못했습니다.");
  return { blob: png, ext: "png", width: out.width, height: out.height, greenShare: green / (src.width * src.height) };
}

/** 배경 그림 줄이기: 가로 maxWidth 이하로, WebP (안 되면 JPEG) */
export async function fitImage(file: Blob, maxWidth = 1920): Promise<{ blob: Blob; ext: "webp" | "jpg"; width: number; height: number }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bmp.width);
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const toBlob = (type: string, q?: number) => new Promise<Blob | null>((res) => c.toBlob(res, type, q));
  const webp = await toBlob("image/webp", 0.86);
  if (webp && webp.type === "image/webp") return { blob: webp, ext: "webp", width: c.width, height: c.height };
  const jpg = await toBlob("image/jpeg", 0.88);
  if (!jpg) throw new Error("그림을 만들지 못했습니다.");
  return { blob: jpg, ext: "jpg", width: c.width, height: c.height };
}
