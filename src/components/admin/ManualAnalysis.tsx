"use client";

import { useState } from "react";
import { api } from "@/lib/admin-client";

const SOURCES = ["Claude 채팅", "ChatGPT 채팅", "Gemini 채팅", "기타"];

/**
 * 셀프 분석: 프롬프트를 복사해 쓰고 있는 채팅 AI(Claude / ChatGPT / Gemini)에 붙여넣고,
 * 돌려받은 JSON 을 여기에 붙여넣으면 API 분석과 같은 방식으로 저장한다. (API 비용 없음)
 */
export function ManualAnalysis({
  questionId,
  imageUrl,
  onSaved,
}: {
  questionId: string;
  imageUrl: string | null;
  onSaved: (message: string) => void;
}) {
  const [text, setText] = useState("");
  const [source, setSource] = useState(SOURCES[0]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copyPrompt() {
    setError(null);
    try {
      const { prompt } = await api<{ prompt: string }>(`/api/admin/questions/${questionId}/manual`, "GET");
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ textUpdated: boolean }>(`/api/admin/questions/${questionId}/manual`, "POST", { text, source });
      setText("");
      onSaved(`${source} 분석 결과를 저장했습니다.${r.textUpdated ? " AI 가 이미지에서 읽은 전체 원문으로 문항 텍스트도 채웠습니다." : ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>
          <b className="text-ink">분석 프롬프트 복사</b>를 누르고, 쓰고 있는 Claude · ChatGPT · Gemini 채팅창에 붙여넣습니다.
        </li>
        <li>
          <b className="text-ink">문항 이미지도 꼭 첨부하세요.</b> 박스·말풍선 제시문이 PDF 에 그림으로 들어 있는 경우, AI 가 이미지에서 원문을 읽어 문항 텍스트까지 채워 줍니다. (아래 버튼으로 이미지를 열어 저장 / 복사)
        </li>
        <li>AI 가 준 답(```json … ```)을 통째로 복사해 아래 칸에 붙여넣고 저장합니다.</li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={copyPrompt}>
          {copied ? "✓ 복사됨" : "분석 프롬프트 복사"}
        </button>
        {imageUrl && (
          <a className="btn" href={imageUrl} target="_blank" rel="noreferrer">
            문항 이미지 열기
          </a>
        )}
      </div>
      <textarea
        className="input min-h-40 font-mono text-xs"
        placeholder="채팅 AI 의 답을 여기에 붙여넣으세요. 앞뒤 설명이나 ```json 표시가 섞여 있어도 됩니다."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <select className="input !w-auto" value={source} onChange={(e) => setSource(e.target.value)} aria-label="사용한 AI">
          {SOURCES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button className="btn-primary" disabled={busy || text.trim().length < 2} onClick={save}>
          {busy ? "검사 중…" : "검사하고 저장"}
        </button>
        <span className="text-xs text-faint">저장하면 기존 AI 분석은 새 결과로 바뀝니다. (관리자가 직접 확인한 사상가·개념·원전 연결은 유지)</span>
      </div>
      {error && <p className="rounded bg-danger-soft p-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
