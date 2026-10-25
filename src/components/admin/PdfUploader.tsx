"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api, processExamPdf, uploadPdf, type ProcessProgress } from "@/lib/admin-client";
import { openPdf, renderPageToCanvas, sha256Hex } from "@/lib/pdf/browser";
import { formatBytes } from "@/lib/format";
import { ProgressBar } from "./ProgressBar";

interface Picked {
  file: File;
  buffer: ArrayBuffer;
  hash: string;
  pages: number;
  preview: string;
}

export function PdfUploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [dragging, setDragging] = useState(false);
  const [duplicate, setDuplicate] = useState<{ id: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ProcessProgress | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const thisYear = new Date().getFullYear() + 1;
  const [form, setForm] = useState({
    exam_year: thisYear,
    exam_name: "중등교사 임용시험",
    subject: "도덕·윤리",
    section: "A" as "A" | "B" | "",
    note: "",
  });

  async function pick(file: File | undefined) {
    setError(null);
    setDuplicate(null);
    setPicked(null);
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("PDF 파일만 업로드할 수 있습니다.");
      return;
    }
    setBusy(true);
    setProgress({ step: "PDF 읽는 중", done: 0, total: 1 });
    try {
      const buffer = await file.arrayBuffer();
      const hash = await sha256Hex(buffer);
      const doc = await openPdf(buffer);
      const canvas = await renderPageToCanvas(doc, 1, 0.8);
      setPicked({ file, buffer, hash, pages: doc.numPages, preview: canvas.toDataURL("image/jpeg", 0.8) });
      const m = file.name.match(/(20\d{2})/);
      const sec = file.name.match(/전공\s*([AB])|[_\s-]([AB])[_\s.-]/i);
      setForm((f) => ({
        ...f,
        exam_year: m ? Number(m[1]) : f.exam_year,
        section: sec ? ((sec[1] ?? sec[2]).toUpperCase() as "A" | "B") : f.section,
      }));
      const dup = await api<{ exists: boolean; exam?: { id: string; exam_year: number; section: string | null } }>(
        "/api/admin/exams/check",
        "POST",
        { hash },
      );
      if (dup.exists && dup.exam) {
        setDuplicate({ id: dup.exam.id, label: `${dup.exam.exam_year} 전공${dup.exam.section ?? ""}` });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function submit() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    let examId: string | null = null;
    try {
      setProgress({ step: "시험 등록", done: 0, total: 1 });
      const created = await api<{ exam: { id: string }; upload: { path: string; token: string } }>("/api/admin/exams", "POST", {
        exam_year: Number(form.exam_year),
        exam_name: form.exam_name,
        subject: form.subject,
        section: form.section || null,
        note: form.note || null,
        pdf_hash: picked.hash,
        pdf_size: picked.file.size,
        page_count: picked.pages,
      });
      examId = created.exam.id;
      setProgress({ step: "PDF 업로드", done: 0, total: 1 });
      await uploadPdf(created.upload.path, created.upload.token, picked.file);
    } catch (e) {
      const err = e as Error & { status?: number; body?: { examId?: string } };
      if (err.status === 409 && err.body?.examId) {
        setDuplicate({ id: err.body.examId, label: "기존 시험" });
      } else {
        setError(err.message);
        if (examId) await api(`/api/admin/exams/${examId}`, "DELETE").catch(() => {});
      }
      setBusy(false);
      setProgress(null);
      return;
    }
    // 페이지 분석 (실패해도 시험은 등록된 상태로 남고, 시험 관리 화면에서 다시 실행할 수 있다)
    try {
      const result = await processExamPdf(examId, picked.buffer, setProgress);
      setWarnings(result.warnings);
      router.push(`/admin/exams/${examId}?segmented=${result.saved}`);
    } catch (e) {
      setError(`시험은 등록되었지만 페이지 분석에 실패했습니다: ${e instanceof Error ? e.message : String(e)}`);
      router.push(`/admin/exams/${examId}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files?.[0]);
          }}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 text-center ${
            dragging ? "border-navy bg-navy-soft" : "border-line-strong bg-surface hover:border-navy"
          }`}
        >
          <p className="font-semibold">PDF 파일을 여기로 끌어다 놓거나 클릭해서 선택하세요</p>
          <p className="mt-1 text-sm text-muted">윤리 임용고시 기출 PDF (최대 100MB)</p>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        </div>

        {picked && (
          <div className="card flex gap-4 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={picked.preview} alt="PDF 1페이지 미리보기" className="w-40 rounded border border-line bg-white" />
            <dl className="grid grid-cols-[5rem_1fr] content-start gap-y-1 text-sm">
              <dt className="text-muted">파일명</dt>
              <dd className="break-all font-medium">{picked.file.name}</dd>
              <dt className="text-muted">크기</dt>
              <dd>{formatBytes(picked.file.size)}</dd>
              <dt className="text-muted">페이지</dt>
              <dd>{picked.pages}쪽</dd>
              <dt className="text-muted">SHA-256</dt>
              <dd className="break-all font-mono text-xs text-faint">{picked.hash}</dd>
            </dl>
          </div>
        )}

        {duplicate && (
          <div className="rounded-lg border border-warn/40 bg-warn-soft p-4">
            <p className="font-semibold text-warn">이미 등록된 시험입니다.</p>
            <p className="mt-1 text-sm">같은 PDF 가 이미 등록되어 있어 새로 분석하지 않습니다.</p>
            <Link href={`/admin/exams/${duplicate.id}`} className="btn mt-2">
              기존 시험으로 이동 ({duplicate.label})
            </Link>
          </div>
        )}
        {error && <p className="rounded bg-danger-soft p-3 text-sm text-danger">{error}</p>}
        {warnings.length > 0 && (
          <ul className="list-disc pl-5 text-sm text-warn">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
        <ProgressBar p={progress} />
      </div>

      <form
        className="card space-y-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2 className="text-sm font-bold">시험 정보</h2>
        <div>
          <label className="label">학년도</label>
          <input type="number" className="input" value={form.exam_year} onChange={(e) => setForm({ ...form, exam_year: Number(e.target.value) })} min={1990} max={2100} required />
        </div>
        <div>
          <label className="label">시험명</label>
          <input className="input" value={form.exam_name} onChange={(e) => setForm({ ...form, exam_name: e.target.value })} required />
        </div>
        <div>
          <label className="label">과목</label>
          <input className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required />
        </div>
        <div>
          <label className="label">구분</label>
          <select className="input" value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value as "A" | "B" | "" })}>
            <option value="A">전공 A</option>
            <option value="B">전공 B</option>
            <option value="">구분 없음</option>
          </select>
        </div>
        <div>
          <label className="label">비고</label>
          <textarea className="input min-h-20" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
        <button className="btn-primary w-full" disabled={!picked || busy || Boolean(duplicate)}>
          {busy ? "처리 중…" : "등록하고 문항 분리 시작"}
        </button>
        <p className="text-xs text-faint">페이지 렌더링과 문항 분리는 이 브라우저에서 실행되므로 창을 닫지 마세요.</p>
      </form>
    </div>
  );
}
