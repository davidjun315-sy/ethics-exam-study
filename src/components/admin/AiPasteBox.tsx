"use client";

import { useState } from "react";
import { api } from "@/lib/admin-client";

const SOURCES = ["Claude 채팅", "ChatGPT 채팅", "Gemini 채팅", "기타"];

/**
 * API 키 없이 쓰는 AI 작업: 프롬프트를 복사해 채팅 AI 에 붙여넣고, 받은 JSON 을 다시 붙여넣어 저장한다.
 * promptUrl(GET) → { prompt }, submitUrl(POST { text, source })
 */
export function AiPasteBox({
  promptUrl,
  submitUrl,
  copyLabel = "프롬프트 복사",
  onSaved,
}: {
  promptUrl: string;
  submitUrl: string;
  copyLabel?: string;
  onSaved: (message: string) => void;
}) {
  const [text, setText] = useState("");
  const [source, setSource] = useState(SOURCES[0]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn"
          onClick={async () => {
            setError(null);
            try {
              const { prompt } = await api<{ prompt: string }>(promptUrl, "GET");
              await navigator.clipboard.writeText(prompt);
              setCopied(true);
              setTimeout(() => setCopied(false), 3000);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          {copied ? "✓ 복사됨" : copyLabel}
        </button>
        <span className="text-xs text-faint">채팅 AI 에 붙여넣고, 받은 답(```json …```)을 아래에 붙여넣으세요.</span>
      </div>
      <textarea
        className="input min-h-28 font-mono text-xs"
        placeholder="채팅 AI 의 답을 여기에 붙여넣으세요."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <select className="input !w-auto" value={source} onChange={(e) => setSource(e.target.value)} aria-label="사용한 AI">
          {SOURCES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button
          className="btn-primary"
          disabled={busy || text.trim().length < 2}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api(submitUrl, "POST", { text, source });
              setText("");
              onSaved(`${source} 결과를 저장했습니다.`);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "검사 중…" : "검사하고 저장"}
        </button>
      </div>
      {error && <p className="rounded bg-danger-soft p-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
