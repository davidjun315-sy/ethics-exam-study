"use client";

/**
 * 개인 학습 기록 (브라우저 localStorage 전용).
 * Supabase 공용 데이터와 섞지 않으며, 친구가 자기 브라우저로 접속하면 별도로 저장된다.
 */
import { useCallback, useSyncExternalStore } from "react";
import type { Grading } from "@/lib/ai/schemas";

export interface QuestionRecord {
  ref?: string; // 표시용 (예: "2026 A 3번")
  solved?: boolean; // 푼 문제
  wrong?: boolean; // 오답 표시
  bookmarked?: boolean; // 북마크
  done?: boolean; // 학습 완료
  review?: boolean; // 다시 볼 문제
  answer?: string; // 내 답안
  memo?: string; // 내 메모
  grading?: Grading & { gradedAt: string };
  updatedAt?: string;
}

interface StudyState {
  version: 1;
  questions: Record<string, QuestionRecord>;
}

const KEY = "ees:study:v1";
const EMPTY: StudyState = { version: 1, questions: {} };
const listeners = new Set<() => void>();
let cache: StudyState | null = null;
let cacheRaw: string | null = null;

function read(): StudyState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === cacheRaw && cache) return cache;
    cacheRaw = raw;
    cache = raw ? { ...EMPTY, ...(JSON.parse(raw) as StudyState) } : EMPTY;
    return cache;
  } catch {
    return EMPTY;
  }
}

function write(next: StudyState) {
  try {
    const raw = JSON.stringify(next);
    window.localStorage.setItem(KEY, raw);
    cache = next;
    cacheRaw = raw;
  } catch {
    // 저장 공간 부족 / 비공개 모드 등
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useStudyState(): StudyState {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function useQuestionRecord(questionId: string) {
  const state = useStudyState();
  const record = state.questions[questionId] ?? {};
  const update = useCallback(
    (patch: Partial<QuestionRecord>) => {
      const cur = read();
      const prev = cur.questions[questionId] ?? {};
      write({
        ...cur,
        questions: { ...cur.questions, [questionId]: { ...prev, ...patch, updatedAt: new Date().toISOString() } },
      });
    },
    [questionId],
  );
  return { record, update };
}

export function exportStudyData(): string {
  return JSON.stringify(read(), null, 2);
}

export function importStudyData(json: string) {
  const parsed = JSON.parse(json) as StudyState;
  if (!parsed || typeof parsed !== "object" || !parsed.questions) throw new Error("올바른 학습 기록 파일이 아닙니다.");
  const cur = read();
  write({ version: 1, questions: { ...cur.questions, ...parsed.questions } });
}

export function clearStudyData() {
  write(EMPTY);
}

// ---------------------------------------------------------------------
// 화면 설정 (문제 풀이 모드 등)
// ---------------------------------------------------------------------
const prefListeners = new Set<() => void>();

export function useBoolPref(key: string, defaultValue: boolean): [boolean, (v: boolean) => void] {
  const value = useSyncExternalStore(
    (cb) => {
      prefListeners.add(cb);
      return () => prefListeners.delete(cb);
    },
    () => {
      try {
        const v = window.localStorage.getItem(key);
        return v === null ? defaultValue : v === "on";
      } catch {
        return defaultValue;
      }
    },
    () => defaultValue,
  );
  const set = useCallback(
    (v: boolean) => {
      try {
        window.localStorage.setItem(key, v ? "on" : "off");
      } catch {}
      prefListeners.forEach((l) => l());
    },
    [key],
  );
  return [value, set];
}
