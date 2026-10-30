import Link from "next/link";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { DataError, load } from "@/components/DataError";
import { Badge, Empty, PageTitle } from "@/components/ui";
import { isAIConfigured } from "@/lib/ai/provider";
import { listExams } from "@/lib/data/queries";
import { isSupabaseAdminConfigured, isSupabaseConfigured, serverEnv } from "@/lib/env";
import { examFullLabel, formatBytes, formatDate } from "@/lib/format";

export const metadata = { title: "관리자" };

const STATUS: Record<string, string> = { uploaded: "문항 분리 전", segmented: "문항 분리됨", analyzing: "분석 중", analyzed: "분석 완료" };

export default async function AdminHome() {
  const checks = [
    { label: "Supabase 읽기 (URL / anon key)", ok: isSupabaseConfigured() },
    { label: "Supabase 쓰기 (service role key)", ok: isSupabaseAdminConfigured() },
    { label: `AI (${serverEnv.aiProvider()} / ${serverEnv.aiModel() ?? "기본 모델"})`, ok: isAIConfigured() },
    { label: "세션 비밀키 (ADMIN_SESSION_SECRET, 선택)", ok: Boolean(serverEnv.sessionSecret()), optional: true },
  ];
  const { data, error } = await load(listExams);

  return (
    <div className="space-y-6">
      <PageTitle
        title="관리자"
        subtitle="PDF 업로드 → 페이지 분석(문항 분리) → AI 분석 → 검수 순서로 진행합니다."
        actions={
          <>
            <Link href="/admin/upload" className="btn-primary">PDF 업로드</Link>
            <Link href="/admin/quiz" className="btn">윤리 퀴즈 관리</Link>
            <Link href="/admin/texts" className="btn">원문 텍스트 편집</Link>
            <Link href="/admin/export" className="btn">분석 자료 내보내기</Link>
            <Link href="/admin/philosophers" className="btn">사상가 페이지 편집</Link>
            <Link href="/admin/data" className="btn">사상가·개념·원전 관리</Link>
            <LogoutButton />
          </>
        }
      />
      <section className="card p-4">
        <h2 className="mb-2 text-sm font-bold">환경 설정 상태</h2>
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-2">
              <span className={c.ok ? "text-ok" : c.optional ? "text-faint" : "text-danger"}>{c.ok ? "●" : "○"}</span>
              {c.label}
              {!c.ok && !c.optional && <span className="text-xs text-danger">설정 필요</span>}
            </li>
          ))}
        </ul>
      </section>
      {error || !data ? (
        <DataError error={error} />
      ) : data.length === 0 ? (
        <Empty>등록된 시험이 없습니다. PDF 를 업로드하세요.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line bg-surface-2 text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">시험</th>
                <th className="px-4 py-2 font-medium">상태</th>
                <th className="px-4 py-2 font-medium">문항</th>
                <th className="px-4 py-2 font-medium">PDF</th>
                <th className="px-4 py-2 font-medium">등록일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.map((e) => (
                <tr key={e.id} className="hover:bg-surface-2">
                  <td className="px-4 py-2">
                    <Link href={`/admin/exams/${e.id}`} className="font-medium text-navy hover:underline">{examFullLabel(e)}</Link>
                  </td>
                  <td className="px-4 py-2"><Badge tone={e.status === "uploaded" ? "warn" : "navy"}>{STATUS[e.status]}</Badge></td>
                  <td className="px-4 py-2 tabular-nums">{e.question_count}</td>
                  <td className="px-4 py-2 text-muted">{e.page_count ?? "-"}p · {formatBytes(e.pdf_size)}</td>
                  <td className="px-4 py-2 text-muted">{formatDate(e.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
