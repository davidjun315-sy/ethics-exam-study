/**
 * PDF 텍스트 레이어 기반 레이아웃 분석 + 문항 자동 분리.
 *
 * 입력: 페이지별 텍스트 조각(좌표 포함, 좌상단 원점, PDF point 단위)
 * 처리: 머리말/꼬리말 제거 → 2단 편집(단 구분선) 탐지 → 줄 묶기 → 문항 번호 탐지 → 문항 영역 분리
 * 출력: 문항별 영역(0~1 정규화 좌표, 여러 단/페이지에 걸칠 수 있음)과 텍스트
 *
 * 브라우저(pdf.js)와 Node(테스트) 양쪽에서 동작하도록 순수 함수로 작성했다.
 */

import type { Region } from "../types.ts";

export interface TextItem {
  str: string;
  x: number; // 왼쪽
  y: number; // 위쪽 (top)
  w: number;
  h: number;
}

export interface PageText {
  pageNumber: number;
  width: number;
  height: number;
  items: TextItem[];
  /** 페이지에 그려진 그림 위치 (PDF point, 좌상단 원점). 그림으로 들어간 제시문이 문항 영역에서 잘리지 않게 한다. */
  images?: { x: number; y: number; w: number; h: number }[];
}

export interface Line {
  text: string;
  x0: number;
  x1: number;
  top: number;
  bottom: number;
}

export interface ColumnBlock {
  pageNumber: number;
  x0: number;
  x1: number;
  lines: Line[];
  /** 이 단의 그림들 (위쪽 y 순) */
  images: { top: number; bottom: number }[];
}

export interface SegmentedQuestion {
  questionNumber: number;
  label: string;
  score: number | null;
  questionType: string | null;
  pageStart: number;
  pageEnd: number;
  regions: Region[];
  text: string;
  needsReview: boolean;
}

export interface PageLayoutInfo {
  pageNumber: number;
  columns: 1 | 2;
  gutterX: number | null; // 0~1
  hasTextLayer: boolean;
  text: string;
}

export interface SegmentationResult {
  questions: SegmentedQuestion[];
  pages: PageLayoutInfo[];
  warnings: string[];
  scanned: boolean;
}

const HEADER_PATTERN = /(학년도|임용|교사|전공\s*[AB]|교시|도덕\s*[·・.]?\s*윤리|수험\s*번호|성\s*명|^\s*[-–—]?\s*\d{1,2}\s*[-–—]?\s*$|\d+\s*\/\s*\d+|쪽|페이지)/;
const QUESTION_START = /^\s*(\d{1,2})\s*[.．]\s*(?=\S)/;
const SCORE_PATTERN = /[〔【\[(（]\s*(\d+(?:\.\d+)?)\s*점\s*[〕】\])）]/;

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function percentile(nums: number[], p: number): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * p)))];
}

/** 같은 높이의 텍스트 조각을 한 줄로 묶는다. */
export function groupLines(items: TextItem[]): Line[] {
  const valid = items.filter((i) => i.str.trim().length > 0 && i.h > 0);
  if (valid.length === 0) return [];
  const medH = median(valid.map((i) => i.h)) || 10;
  const sorted = [...valid].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x);
  const groups: TextItem[][] = [];
  for (const item of sorted) {
    const center = item.y + item.h / 2;
    const last = groups[groups.length - 1];
    if (last) {
      const lastCenter = median(last.map((i) => i.y + i.h / 2));
      if (Math.abs(center - lastCenter) <= medH * 0.5) {
        last.push(item);
        continue;
      }
    }
    groups.push([item]);
  }
  return groups.map((g) => {
    const byX = [...g].sort((a, b) => a.x - b.x);
    let text = "";
    let prevEnd: number | null = null;
    for (const it of byX) {
      if (prevEnd !== null && it.x - prevEnd > it.h * 0.25 && !text.endsWith(" ")) text += " ";
      text += it.str;
      prevEnd = it.x + it.w;
    }
    return {
      text: text.replace(/\s+/g, " ").trim(),
      x0: Math.min(...byX.map((i) => i.x)),
      x1: Math.max(...byX.map((i) => i.x + i.w)),
      top: Math.min(...byX.map((i) => i.y)),
      bottom: Math.max(...byX.map((i) => i.y + i.h)),
    };
  });
}

/** 머리말/꼬리말 조각인지 판단 */
function isHeaderOrFooter(item: TextItem, page: PageText, lineText: string): boolean {
  const rel = item.y / page.height;
  const relBottom = (item.y + item.h) / page.height;
  if (rel < 0.03 || relBottom > 0.975) return true;
  // "1. 다음은 도덕 교사와…" 처럼 문항 번호로 시작하는 줄은 머리말 단어가 있어도 문항이다.
  if (QUESTION_START.test(lineText)) return false;
  if (rel < 0.1 && HEADER_PATTERN.test(lineText)) return true;
  if (relBottom > 0.92 && HEADER_PATTERN.test(lineText)) return true;
  return false;
}

/** 2단 편집 여부와 단 구분 x 좌표를 찾는다. */
export function detectGutter(items: TextItem[], pageWidth: number): number | null {
  if (items.length < 10) return null;
  let best: { x: number; cover: number } | null = null;
  for (let rel = 0.35; rel <= 0.65; rel += 0.005) {
    const x = rel * pageWidth;
    let cover = 0;
    for (const it of items) if (it.x < x && it.x + it.w > x) cover++;
    if (!best || cover < best.cover || (cover === best.cover && Math.abs(rel - 0.5) < Math.abs(best.x / pageWidth - 0.5))) {
      best = { x, cover };
    }
  }
  if (!best) return null;
  const left = items.filter((i) => i.x + i.w <= best.x).length;
  const right = items.filter((i) => i.x >= best.x).length;
  const total = items.length;
  const crossRatio = best.cover / total;
  if (crossRatio <= 0.03 && left / total >= 0.15 && right / total >= 0.15) return best.x;
  return null;
}

function inferQuestionType(rawText: string, score: number | null): string | null {
  const text = rawText.replace(/\s+/g, "");
  if (/논술하시오|논술형/.test(text)) return "논술형";
  if (/서술하시오|설명하시오|논하시오|제시하시오/.test(text)) return "서술형";
  if (/쓰시오|적으시오/.test(text)) return score !== null && score <= 2 ? "기입형" : "서술형";
  return null;
}

/** 페이지들을 읽기 순서대로 단 블록(ColumnBlock)으로 나눈다. */
export function buildColumnBlocks(pages: PageText[]): { blocks: ColumnBlock[]; layouts: PageLayoutInfo[] } {
  const blocks: ColumnBlock[] = [];
  const layouts: PageLayoutInfo[] = [];
  for (const page of pages) {
    const rawLines = groupLines(page.items);
    const allText = rawLines.map((l) => l.text).join("\n");
    const hasTextLayer = allText.replace(/\s/g, "").length >= 20;

    // 머리말/꼬리말 제거 (줄 단위 판단을 위해 각 조각이 속한 줄 텍스트를 함께 본다)
    const content = page.items.filter((it) => {
      if (!it.str.trim()) return false;
      const line = rawLines.find((l) => it.y >= l.top - 0.5 && it.y + it.h <= l.bottom + 0.5);
      return !isHeaderOrFooter(it, page, line?.text ?? it.str);
    });

    const gutter = detectGutter(content, page.width);
    layouts.push({
      pageNumber: page.pageNumber,
      columns: gutter ? 2 : 1,
      gutterX: gutter ? gutter / page.width : null,
      hasTextLayer,
      text: allText,
    });
    if (!hasTextLayer) continue;

    const columns: { x0: number; x1: number; items: TextItem[] }[] = gutter
      ? [
          { x0: 0, x1: gutter, items: content.filter((i) => i.x + i.w / 2 < gutter) },
          { x0: gutter, x1: page.width, items: content.filter((i) => i.x + i.w / 2 >= gutter) },
        ]
      : [{ x0: 0, x1: page.width, items: content }];

    // 문항 이미지는 단 전체 폭으로 자른다. (텍스트보다 넓은 그림·박스 제시문이 잘리지 않도록)
    // 좌우 여백은 페이지 왼쪽 여백과 같다고 보고 대칭으로 잡는다.
    const margin = Math.max(0, Math.min(...content.map((i) => i.x)) - 6);
    for (const col of columns) {
      const lines = groupLines(col.items);
      if (lines.length === 0) continue;
      // 이 단에 속한 그림 (가운데가 단 안에 있고, 머리말/꼬리말 띠가 아닌 것)
      const images = (page.images ?? [])
        .filter((im) => {
          const cx = im.x + im.w / 2;
          return cx >= col.x0 && cx < col.x1 && im.y / page.height > 0.03 && (im.y + im.h) / page.height < 0.97;
        })
        .map((im) => ({ top: im.y, bottom: im.y + im.h }))
        .sort((a, b) => a.top - b.top);
      blocks.push({
        pageNumber: page.pageNumber,
        x0: Math.max(col.x0 === 0 ? margin : col.x0 + 2, 0),
        x1: Math.min(col.x1 === page.width ? page.width - margin : col.x1 - 2, page.width),
        lines,
        images,
      });
    }
  }
  return { blocks, layouts };
}

export function segmentQuestions(pages: PageText[]): SegmentationResult {
  const warnings: string[] = [];
  const { blocks, layouts } = buildColumnBlocks(pages);
  const pageSize = new Map(pages.map((p) => [p.pageNumber, { w: p.width, h: p.height }]));
  const scanned = layouts.length > 0 && layouts.every((l) => !l.hasTextLayer);

  if (scanned) {
    warnings.push("텍스트 레이어가 없는 스캔 PDF 입니다. 페이지 단위로 임시 문항을 만들었습니다. 관리자 화면에서 문항을 나누고 AI 분석(이미지 판독)을 사용하세요.");
    return {
      scanned,
      pages: layouts,
      warnings,
      questions: pages.map((p, i) => ({
        questionNumber: i + 1,
        label: String(i + 1),
        score: null,
        questionType: null,
        pageStart: p.pageNumber,
        pageEnd: p.pageNumber,
        regions: [{ page: p.pageNumber, x0: 0.03, y0: 0.04, x1: 0.97, y1: 0.96 }],
        text: "",
        needsReview: true,
      })),
    };
  }

  interface Draft {
    number: number;
    segments: { page: number; x0: number; x1: number; top: number; bottom: number }[];
    lines: string[];
  }
  const drafts: Draft[] = [];
  let current: Draft | null = null;
  let expected = 1;

  for (const block of blocks) {
    const leftMargin = percentile(
      block.lines.map((l) => l.x0),
      0.1,
    );
    const medLineH = median(block.lines.map((l) => l.bottom - l.top)) || 10;
    const pad = medLineH * 0.6;
    let segStart: number | null = current ? block.lines[0].top - pad : null;

    for (const line of block.lines) {
      const m = line.text.match(QUESTION_START);
      const nearLeft = line.x0 <= leftMargin + medLineH * 2.5;
      const n = m ? Number(m[1]) : NaN;
      const sequential = !Number.isNaN(n) && (n === expected || (n > expected && n <= expected + 2 && drafts.length > 0));
      if (m && nearLeft && sequential) {
        if (current && segStart !== null) {
          current.segments.push({ page: block.pageNumber, x0: block.x0, x1: block.x1, top: segStart, bottom: line.top - pad });
        }
        if (n !== expected) warnings.push(`${expected}번 문항을 찾지 못했습니다. (${n}번으로 건너뜀)`);
        current = { number: n, segments: [], lines: [] };
        drafts.push(current);
        expected = n + 1;
        segStart = line.top - pad;
      }
      if (current) current.lines.push(line.text);
    }
    if (current && segStart !== null) {
      const last = block.lines[block.lines.length - 1];
      // 마지막 글줄 아래에 그림(그림으로 들어간 제시문 등)이 있으면 그 아래까지 포함한다.
      const imageBottom = Math.max(0, ...block.images.filter((im) => im.bottom > segStart).map((im) => im.bottom));
      current.segments.push({
        page: block.pageNumber,
        x0: block.x0,
        x1: block.x1,
        top: segStart,
        bottom: Math.max(last.bottom, imageBottom) + pad,
      });
    }
  }

  if (drafts.length === 0) {
    warnings.push("문항 번호를 찾지 못했습니다. 관리자 화면에서 문항을 직접 추가하세요.");
  }

  const questions: SegmentedQuestion[] = drafts.map((d) => {
    const regions: Region[] = d.segments
      .map((s) => {
        const size = pageSize.get(s.page)!;
        return {
          page: s.page,
          x0: clamp(s.x0 / size.w),
          x1: clamp(s.x1 / size.w),
          y0: clamp(s.top / size.h),
          y1: clamp(s.bottom / size.h),
        };
      })
      .filter((r) => r.y1 - r.y0 > 0.01);
    const text = d.lines.join("\n");
    const scoreMatch = text.match(SCORE_PATTERN);
    const score = scoreMatch ? Number(scoreMatch[1]) : null;
    return {
      questionNumber: d.number,
      label: String(d.number),
      score,
      questionType: inferQuestionType(text, score),
      pageStart: regions[0]?.page ?? 1,
      pageEnd: regions[regions.length - 1]?.page ?? 1,
      regions,
      text,
      needsReview: score === null || regions.length === 0,
    };
  });

  return { questions, pages: layouts, warnings, scanned };
}

function clamp(v: number): number {
  return Math.min(1, Math.max(0, Number(v.toFixed(4))));
}
