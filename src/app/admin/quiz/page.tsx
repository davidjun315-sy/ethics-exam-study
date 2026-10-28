import Link from "next/link";
import { DataError, load } from "@/components/DataError";
import { ItemList, ManualItemForm, ReportList, SettingsForm, SyncButton } from "@/components/admin/QuizAdmin";
import { PageTitle } from "@/components/ui";
import { getBankStatus, getQuizSettings, listLearnerStats, listOpenReports, listQuizItems } from "@/lib/quiz/bank";
import { LEVEL_NAMES } from "@/lib/quiz/srs";

export const metadata = { title: "윤리 퀴즈 관리" };

const TABS = [
  { key: "overview", label: "현황" },
  { key: "items", label: "문제 검수" },
  { key: "reports", label: "오답 검수 요청" },
  { key: "settings", label: "미션 설정 · 문제 추가" },
] as const;

const STATUS_LABEL: Record<string, string> = { approved: "공개", pending: "승인 대기", hidden: "비공개", stale: "출제 중지" };

export default async function AdminQuizPage({ searchParams }: PageProps<"/admin/quiz">) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "overview";
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const filter = {
    status: str(sp.status) ?? (tab === "items" && !sp.status ? "pending" : undefined),
    kind: str(sp.kind),
    review: sp.review === "1",
    changed: sp.changed === "1",
    q: str(sp.q),
  };
  const { data, error } = await load(async () => {
    const [status, settings] = await Promise.all([getBankStatus(), getQuizSettings()]);
    return {
      status,
      settings,
      items: tab === "items" ? await listQuizItems({ ...filter, status: filter.status === "all" ? undefined : filter.status }) : [],
      reports: tab === "reports" ? await listOpenReports() : [],
      learners: tab === "overview" ? await listLearnerStats() : [],
    };
  });

  return (
    <div className="space-y-4">
      <PageTitle
        title="윤리 퀴즈 관리"
        subtitle="분석된 기출을 답 하나 단위의 퀴즈로 나누고, 검수·승인한 문제만 학습에 공개합니다. 기존 기출·분석 데이터는 읽기만 합니다."
        actions={
          <>
            <Link href="/quiz" className="btn">퀴즈 화면</Link>
            <Link href="/admin" className="btn">관리자 홈</Link>
          </>
        }
      />
      <nav className="flex gap-1 overflow-x-auto rounded-lg border border-line bg-surface p-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/quiz?tab=${t.key}`}
            className={`shrink-0 rounded-md px-4 py-2 text-sm ${tab === t.key ? "bg-navy font-semibold text-white dark:text-[#0f141c]" : "text-muted hover:bg-surface-2"}`}
          >
            {t.label}
            {t.key === "reports" && data?.status.openReports ? <span className="ml-1 rounded bg-danger px-1.5 text-xs text-white">{data.status.openReports}</span> : null}
          </Link>
        ))}
      </nav>

      {error || !data ? (
        <DataError error={error} />
      ) : tab === "overview" ? (
        <div className="space-y-4">
          <section className="card space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-[15px] font-bold">문제은행 동기화</h2>
              <SyncButton />
            </div>
            <p className="text-sm text-muted">
              분석이 끝난 모든 기출을 요구 사항(㉠·㉡·작성 방법 조건) 단위로 나누고, 분석의 예상 문제와 출제 예측의 예상 문제를 가져옵니다.
              이미 있는 문제는 같은 id 로 갱신되어 학습 기록이 유지되고, 관리자가 고친 문제는 덮어쓰지 않습니다.
              문항을 분석·수정하면 그 문항은 자동으로 반영됩니다.
            </p>
            {data.status.unsynced.length > 0 && (
              <p className="rounded bg-warn-soft/50 p-2 text-sm text-warn">
                문제은행에 아직 없는 분석 기출 {data.status.unsynced.length}개: {data.status.unsynced.slice(0, 12).map((u) => u.ref).join(", ")}
                {data.status.unsynced.length > 12 ? " …" : ""} — 동기화하세요.
              </p>
            )}
            {data.status.changed > 0 && (
              <p className="rounded bg-warn-soft/50 p-2 text-sm text-warn">
                원본 분석이 바뀐 수정 문제 {data.status.changed}개 —{" "}
                <Link href="/admin/quiz?tab=items&changed=1&status=all" className="underline">확인하기</Link>
              </p>
            )}
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            {(["exam", "expected"] as const).map((kind) => (
              <div key={kind} className="card p-4">
                <h3 className="mb-2 font-bold">{kind === "exam" ? "실제 기출 세부 문제" : "AI 예상 문제"}</h3>
                <ul className="space-y-1 text-sm">
                  {(["approved", "pending", "hidden", "stale"] as const).map((st) => (
                    <li key={st} className="flex justify-between">
                      <Link href={`/admin/quiz?tab=items&kind=${kind}&status=${st}`} className="hover:text-navy">{STATUS_LABEL[st]}</Link>
                      <span className="tabular-nums">{data.status.counts[`${kind}:${st}`] ?? 0}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          <section className="card p-4">
            <h2 className="mb-2 text-[15px] font-bold">학습 현황</h2>
            {data.learners.length === 0 ? (
              <p className="text-sm text-faint">아직 학습 기록이 없습니다.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="text-left text-muted">
                    <tr>
                      <th className="py-1">학습자</th><th>과정</th><th>XP</th><th>연속</th><th>최고</th><th>푼 문제</th><th>기입형 정답률</th><th>자기평가</th><th>마지막 미션</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.learners.map((l) => (
                      <tr key={l.learner} className="border-t border-line">
                        <td className="py-1.5">{l.learner === "owner" ? "본인" : l.learner}</td>
                        <td>{LEVEL_NAMES[l.start_level as keyof typeof LEVEL_NAMES] ?? l.start_level}</td>
                        <td>{l.xp}</td>
                        <td>{l.streak}일</td>
                        <td>{l.best_streak}일</td>
                        <td>{l.total_answered}</td>
                        <td>{l.accuracy === null ? "-" : `${Math.round(l.accuracy * 100)}%`}</td>
                        <td>{l.selfRated}회</td>
                        <td>{l.last_completed_day ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : tab === "items" ? (
        <div className="space-y-3">
          <form className="flex flex-wrap items-end gap-2 text-sm">
            <input type="hidden" name="tab" value="items" />
            <select name="status" defaultValue={filter.status ?? "all"} className="input !w-auto">
              <option value="all">전체 상태</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select name="kind" defaultValue={filter.kind ?? ""} className="input !w-auto">
              <option value="">전체 출처</option>
              <option value="exam">실제 기출</option>
              <option value="expected">AI 예상 문제</option>
            </select>
            <label className="flex items-center gap-1"><input type="checkbox" name="review" value="1" defaultChecked={filter.review} /> 검수 사유 있음</label>
            <label className="flex items-center gap-1"><input type="checkbox" name="changed" value="1" defaultChecked={filter.changed} /> 원본 변경됨</label>
            <input name="q" defaultValue={filter.q ?? ""} placeholder="레이블·정답·발문 검색" className="input !w-48" />
            <button className="btn">보기</button>
          </form>
          <ItemList items={data.items} />
        </div>
      ) : tab === "reports" ? (
        <ReportList reports={data.reports} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card p-4">
            <h2 className="mb-2 text-[15px] font-bold">일일 미션 구성</h2>
            <SettingsForm initial={data.settings} />
          </section>
          <section className="card space-y-3 p-4">
            <h2 className="text-[15px] font-bold">예상 문제 추가</h2>
            <p className="text-sm text-muted">
              전체 기출 분석을 바탕으로 한 예상 문제는{" "}
              <Link href="/trends?tab=predict" className="text-navy underline">출제분석 → 출제 예측</Link>
              에서 주제별로 만들 수 있습니다 (API 또는 채팅 AI 붙여넣기). 만든 뒤 위 &apos;현황 → 동기화&apos;를 누르면 승인 대기로 들어옵니다.
              문항별 예상 문제는 기출 분석의 &apos;향후 출제&apos;에서 가져옵니다. 직접 쓰려면 아래에 입력하세요.
            </p>
            <ManualItemForm />
          </section>
        </div>
      )}
    </div>
  );
}
