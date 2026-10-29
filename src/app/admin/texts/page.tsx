import Link from "next/link";
import { DataError, load } from "@/components/DataError";
import { TextEditorList, type TextRow } from "@/components/admin/TextEditorList";
import { PageTitle } from "@/components/ui";
import { listExams, listQuestionSummaries } from "@/lib/data/queries";
import { examFullLabel } from "@/lib/format";
import { getReadClient } from "@/lib/supabase/server";

export const metadata = { title: "원문 텍스트 편집" };

export default async function AdminTextsPage({ searchParams }: PageProps<"/admin/texts">) {
  const sp = await searchParams;
  const { data, error } = await load(async () => {
    const exams = await listExams();
    const examId = typeof sp.exam === "string" && exams.some((e) => e.id === sp.exam) ? sp.exam : exams[0]?.id;
    if (!examId) return { exams, examId: null, rows: [] as TextRow[] };
    const questions = await listQuestionSummaries({ examId });
    // 분석의 요구 사항별 해설 레이블 (퀴즈 점검용)
    const ids = questions.map((q) => q.id);
    const labels = new Map<string, string[]>();
    for (let i = 0; i < ids.length; i += 60) {
      const { data: rows } = await getReadClient().from("question_analysis").select("question_id, ie:details->itemExplanations").in("question_id", ids.slice(i, i + 60));
      for (const r of rows ?? []) labels.set(r.question_id as string, Array.isArray(r.ie) ? (r.ie as { label: string }[]).map((x) => x.label) : []);
    }
    const rows: TextRow[] = questions.map((q) => ({
      id: q.id,
      label: q.label,
      text: q.question_text ?? "",
      imageUrl: q.question_image_url,
      labels: labels.get(q.id) ?? [],
    }));
    return { exams, examId, rows };
  });
  if (error || !data) return <DataError error={error} />;
  const exam = data.exams.find((e) => e.id === data.examId);

  return (
    <div className="space-y-4">
      <PageTitle
        title="원문 텍스트 편집"
        subtitle="문항 텍스트(문항 화면의 '텍스트 보기', 윤리 퀴즈의 원문)를 시험 단위로 한 화면에서 고칩니다. 저장하면 퀴즈에도 바로 반영됩니다."
        actions={
          <>
            {exam && <Link href={`/admin/exams/${exam.id}`} className="btn">시험 관리</Link>}
            <Link href="/admin" className="btn">관리자 홈</Link>
          </>
        }
      />
      <form className="flex flex-wrap items-center gap-2">
        <select name="exam" defaultValue={data.examId ?? ""} className="input max-w-full !w-auto min-w-0 flex-1 sm:flex-none">
          {data.exams.map((e) => (
            <option key={e.id} value={e.id}>
              {examFullLabel(e)} ({e.question_count}문항)
            </option>
          ))}
        </select>
        <button className="btn">열기</button>
      </form>
      <details className="card p-3 text-sm text-muted">
        <summary className="cursor-pointer font-semibold text-ink">편집 요령</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>문단 안의 줄바꿈은 지우고 문단 사이에만 빈 줄을 두면 휴대폰에서 읽기 좋습니다. ‘다듬기’가 이것을 자동으로 해 줍니다 (저장 전까지는 바뀌지 않음).</li>
          <li><b>&lt;작성 방법&gt;</b> 머리글과, 한 줄에 하나씩 <b>○ 로 시작하는 조건</b>은 그대로 두세요. 퀴즈가 이 줄로 문제를 나눕니다.</li>
          <li>㉠·㉡ 같은 기호는 원래대로 두세요. AI 분석의 해설과 이 기호로 연결됩니다.</li>
          <li>텍스트를 고쳐도 이미 저장된 AI 분석(정답·해설)은 바뀌지 않습니다.</li>
        </ul>
      </details>
      {data.rows.length === 0 ? (
        <p className="rounded border border-dashed border-line p-8 text-center text-sm text-muted">문항이 없습니다.</p>
      ) : (
        <TextEditorList key={data.examId} rows={data.rows} />
      )}
    </div>
  );
}
