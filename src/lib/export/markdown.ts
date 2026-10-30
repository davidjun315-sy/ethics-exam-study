/**
 * 분석 자료 내보내기 (채팅 AI 에 올려 질문하기용 Markdown).
 * DB 를 그때그때 읽어 만들므로 분석을 고치면 다음 내보내기에 바로 반영된다.
 * 이 파일은 순수 함수만 둔다 (npm run test:export).
 */
import type { PhilosopherStudyNote } from "../ai/schemas.ts";
import type { AnalysisDetails, PhilosopherRole } from "../types.ts";

export interface ExportSource {
  title: string | null;
  location: string | null;
  philosopher: string | null;
  overview: string | null;
  related: string | null;
  relation: string | null;
  quoted: string | null;
  status: string;
}

export interface ExportAnalysis {
  area: string | null;
  school: string | null;
  questionType: string | null;
  difficulty: string | null;
  answer: string | null;
  answerExplanation: string | null;
  questionIntent: string | null;
  commonMistakes: string[];
  details: AnalysisDetails;
  status: string;
  version: number;
  updatedAt: string;
}

export interface ExportQuestion {
  id: string;
  ref: string; // "2018 A 1번"
  year: number;
  order: number; // 같은 해 안의 정렬
  score: number | null;
  text: string | null;
  updatedAt: string;
  philosophers: { id: string; name: string; role: PhilosopherRole }[];
  analysis: ExportAnalysis | null;
  sources: ExportSource[];
}

export interface ExportPhilosopher {
  id: string;
  name: string;
  tradition: string | null; // 분류된 섹터 (동양윤리 …)
  school: string | null;
  era: string | null;
  coreIdeas: string | null;
  note: { content: PhilosopherStudyNote; updatedAt: string } | null;
}

export interface ExportOptions {
  questionText: boolean; // 문제 원문
  future: boolean; // 향후 출제 (예상 문제·답안)
}

export const DEFAULT_OPTIONS: ExportOptions = { questionText: true, future: true };

const ROLE: Record<PhilosopherRole, string> = { main: "주요", comparison: "비교", distractor: "오답 유도", mentioned: "언급" };
const IMPORTANCE: Record<string, string> = { required: "필수", supporting: "보조", comparison: "비교", high: "높음", medium: "보통", low: "낮음" };
const VERIFY: Record<string, string> = { confirmed: "확인됨", likely: "유력", candidate: "후보", unknown: "미확인" };

const clean = (s: string | null | undefined) => (s ?? "").trim();
const has = (s: string | null | undefined) => clean(s).length > 0;
/** 여러 줄 글을 인용 블록으로 */
const quote = (s: string) =>
  clean(s)
    .split("\n")
    .map((l) => `> ${l}`.trimEnd())
    .join("\n");
const list = (xs: (string | null | undefined)[]) => xs.filter(has).map((x) => `- ${clean(x)}`).join("\n");
const block = (parts: (string | false | null | undefined)[]) => parts.filter((p): p is string => Boolean(p && p.trim())).join("\n\n");

export function kstStamp(d: Date | string): string {
  const t = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }).format(t);
}

/** 문항 하나 → Markdown (### 제목부터) */
export function questionMarkdown(q: ExportQuestion, opt: ExportOptions = DEFAULT_OPTIONS): string {
  const a = q.analysis;
  const d: AnalysisDetails = a?.details ?? {};
  const who = q.philosophers.map((p) => `${p.name}(${ROLE[p.role]})`).join(", ");
  const meta = [a?.area, a?.school, a?.questionType, a?.difficulty && `난이도 ${a.difficulty}`].filter(has).join(" · ");

  const sections: string[] = [];
  sections.push(`### ${q.ref}${q.score ? ` (${q.score}점)` : ""}${who ? ` — ${who}` : ""}`);
  if (meta) sections.push(`- 분류: ${meta}`);
  if (opt.questionText && has(q.text)) sections.push(`**문제 원문**\n\n${quote(q.text!)}`);

  if (!a) {
    sections.push("_아직 AI 분석이 없습니다._");
    return sections.join("\n\n");
  }

  // 답안
  const answer = block([
    has(d.modelAnswer) && `**모범답안**\n\n${clean(d.modelAnswer)}`,
    !has(d.modelAnswer) && has(a.answer) && `**정답**: ${clean(a.answer)}`,
  ]);
  if (answer) sections.push(answer);

  if (d.itemExplanations?.length) {
    sections.push(
      `**요구 사항별 해설**\n\n${d.itemExplanations
        .map((x) => block([`- **${clean(x.label)}** → ${clean(x.answer)}`, has(x.sourcePart) && `  - 근거: ${clean(x.sourcePart)}`, has(x.explanation) && `  - 해설: ${clean(x.explanation)}`]).replace(/\n\n/g, "\n"))
        .join("\n")}`,
    );
  } else if (has(a.answerExplanation)) {
    sections.push(`**해설**\n\n${clean(a.answerExplanation)}`);
  } else if (d.subAnswers?.length) {
    sections.push(`**하위 정답**\n\n${list(d.subAnswers.map((x) => `${x.label}: ${x.answer}`))}`);
  }

  // 출제 의도
  const intent = d.examinerIntent;
  const intentMd = block([
    has(intent?.summary) ? clean(intent!.summary) : has(a.questionIntent) ? clean(a.questionIntent) : null,
    intent?.itemIntents?.length ? list(intent.itemIntents.map((x) => `${x.label}: ${x.intent}`)) : null,
    intent?.skillsTested?.length ? `확인하는 능력: ${intent.skillsTested.join(", ")}` : null,
  ]);
  if (intentMd) sections.push(`**출제 의도**\n\n${intentMd}`);

  // 원문 해설
  if (d.passageCommentary?.length) {
    sections.push(
      `**원문 해설**\n\n${d.passageCommentary
        .map((p) => block([`- **${clean(p.part)}**${has(p.quote) ? ` 「${clean(p.quote)}」` : ""}`, has(p.commentary) && `  ${clean(p.commentary)}`]).replace(/\n\n/g, "\n"))
        .join("\n")}`,
    );
  } else if (has(d.passageAnalysis)) {
    sections.push(`**제시문 분석**\n\n${clean(d.passageAnalysis)}`);
  }

  // 개념 정리
  const concepts = block([
    d.conceptMap?.length
      ? d.conceptMap
          .map((m) => `- ${clean(m.philosopher)}: **${clean(m.focus)}** (${clean(m.focusGist)})\n${m.branches.map((b) => `  - ${clean(b.relation)} → ${clean(b.keyword)}: ${clean(b.gist)}`).join("\n")}`)
          .join("\n")
      : null,
    d.studyConcepts?.length
      ? d.studyConcepts
          .map((c) =>
            block([
              `- **${clean(c.name)}**${c.philosopher ? ` (${clean(c.philosopher)})` : ""}${c.importance ? ` [${IMPORTANCE[c.importance] ?? c.importance}]` : ""}: ${clean(c.definition)}`,
              has(c.examPoint) && `  - 시험 포인트: ${clean(c.examPoint)}`,
              has(c.distinction) && `  - 구별: ${c.confusableWith?.length ? `${c.confusableWith.join(", ")} — ` : ""}${clean(c.distinction)}`,
            ]).replace(/\n\n/g, "\n"),
          )
          .join("\n")
      : null,
  ]);
  if (concepts) sections.push(`**개념 정리**\n\n${concepts}`);

  // 오답 분석
  const mistakes = block([
    d.confusablePhilosophers?.length ? `혼동 사상가\n${list(d.confusablePhilosophers.map((x) => `${x.name}: ${x.reason}`))}` : null,
    d.confusableConcepts?.length ? `혼동 개념\n${list(d.confusableConcepts.map((x) => `${x.name}: ${x.reason}`))}` : null,
    a.commonMistakes.length ? `자주 하는 실수\n${list(a.commonMistakes)}` : null,
  ]);
  if (mistakes) sections.push(`**오답 분석**\n\n${mistakes}`);

  // 원전
  if (q.sources.length) {
    sections.push(
      `**원전**\n\n${q.sources
        .map((s) =>
          block([
            `- 『${clean(s.title) || "원전 미상"}』${has(s.location) ? ` ${clean(s.location)}` : ""}${has(s.philosopher) ? ` · ${clean(s.philosopher)}` : ""} (${VERIFY[s.status] ?? s.status})`,
            has(s.quoted) && `  - 원문: ${clean(s.quoted)}`,
            has(s.overview) && `  - 원전 해설: ${clean(s.overview)}`,
            has(s.related) && `  - 관련 내용: ${clean(s.related)}`,
            has(s.relation) && `  - 문항과의 관계: ${clean(s.relation)}`,
          ]).replace(/\n\n/g, "\n"),
        )
        .join("\n")}`,
    );
  }

  // 향후 출제
  if (opt.future && d.futureExtensions?.length) {
    sections.push(
      `**향후 출제 (AI 예상)**\n\n${d.futureExtensions
        .map((f, i) =>
          block([
            `${i + 1}. **${clean(f.topic)}**${f.importance ? ` [중요도 ${IMPORTANCE[f.importance] ?? f.importance}]` : ""}`,
            has(f.conceptSummary) && `   - 개념: ${clean(f.conceptSummary)}`,
            has(f.expectedQuestion) && `   - 예상 문제:\n${quote(f.expectedQuestion!).replace(/^/gm, "     ")}`,
            has(f.expectedAnswer) && `   - 예상 답안: ${clean(f.expectedAnswer)}`,
            !has(f.expectedQuestion) && has(f.rationale) && `   - 근거: ${clean(f.rationale)}`,
          ]).replace(/\n\n/g, "\n"),
        )
        .join("\n")}`,
    );
  }
  return sections.join("\n\n");
}

/** 사상가 개념 정리 노트 → Markdown (### 제목부터) */
export function noteMarkdown(name: string, note: PhilosopherStudyNote): string {
  const n = note;
  const parts: (string | null)[] = [
    `### ${name} 개념 정리`,
    has(n.overview?.oneLine) ? `**한 줄 요약**: ${clean(n.overview.oneLine)}` : null,
    has(n.overview?.summary) ? clean(n.overview.summary) : null,
    n.overview?.keywords?.length ? `핵심 키워드: ${n.overview.keywords.join(", ")}` : null,
    n.outline?.length
      ? `**구조도**\n\n${n.outline.map((o) => `- ${clean(o.title)}\n${o.items.map((it) => `  - ${clean(it.keyword)}: ${clean(it.gist)}${it.sub?.length ? ` (${it.sub.join(", ")})` : ""}`).join("\n")}`).join("\n")}`
      : null,
    ...(n.sections ?? []).map((s) =>
      block([
        `#### ${clean(s.title)}`,
        has(s.intro) && clean(s.intro),
        s.concepts
          .map((c) =>
            block([
              `- **${clean(c.name)}**${has(c.originalTerm) ? ` (${clean(c.originalTerm)})` : ""}: ${clean(c.definition)}`,
              has(c.explanation) && `  - 설명: ${clean(c.explanation)}`,
              !!c.keyPoints?.length && `  - 요점: ${c.keyPoints.join(" / ")}`,
              !!c.examPoints?.length && `  - 기출 포인트: ${c.examPoints.join(" / ")}`,
              !!c.confusions?.length && `  - 구별: ${c.confusions.map((x) => `${x.with} — ${x.distinction}`).join(" / ")}`,
              !!c.relatedQuestionRefs?.length && `  - 관련 기출: ${c.relatedQuestionRefs.join(", ")}`,
            ]).replace(/\n\n/g, "\n"),
          )
          .join("\n"),
      ]),
    ),
    n.identification && (n.identification.decisiveExpressions?.length || n.identification.tips?.length)
      ? `**판별 요령**\n\n${list([...(n.identification.decisiveExpressions ?? []).map((x) => `판별 표현: ${x}`), ...(n.identification.tips ?? [])])}`
      : null,
    n.comparisons?.length
      ? `**비교**\n\n${n.comparisons
          .map((c) =>
            block([
              `- **${name} vs ${clean(c.other)}**${has(c.common) ? ` — 공통점: ${clean(c.common)}` : ""}`,
              c.differences.map((x) => `  - ${clean(x.aspect)}: ${name} ${clean(x.mine)} / ${clean(c.other)} ${clean(x.theirs)}`).join("\n"),
            ]).replace(/\n\n/g, "\n"),
          )
          .join("\n")}`
      : null,
    n.traps?.length ? `**함정**\n\n${list(n.traps.map((t) => `${t.trap} → ${t.correction}`))}` : null,
    n.answerTips?.length ? `**답안 작성 요령**\n\n${list(n.answerTips)}` : null,
    n.futureTopics?.length ? `**출제 예상 주제 (AI 판단)**\n\n${list(n.futureTopics.map((t) => `${t.topic}: ${t.reason}`))}` : null,
    n.caveats?.length ? `**확인 필요**\n\n${list(n.caveats)}` : null,
  ];
  return parts.filter((p): p is string => Boolean(p && p.trim())).join("\n\n");
}

const CHAT_GUIDE = `> **채팅 AI 에게**: 이 파일은 도덕·윤리 기출문제와 그 분석(모범답안, 요구 사항별 해설, 출제 의도, 원문 해설, 개념 정리, 원전, 향후 출제)을 정리한 학습 자료입니다.
> 질문에 답할 때는 이 자료를 우선 근거로 삼고, 근거가 된 기출을 "2018 A 1번"처럼 밝혀 주세요.
> 자료에 없는 내용은 일반 지식으로 보충하되 그렇다고 표시하고, 분석은 AI 가 만든 것이라 틀릴 수 있으니 원전과 다르면 지적해 주세요.`;

export function fileHeader(title: string, generatedAt: Date, stats: { questions: number; analyzed: number; philosophers: number; notes: number }, extra?: string): string {
  return block([
    `# ${title}`,
    `- 내보낸 시각: ${kstStamp(generatedAt)} (한국 시간)`,
    `- 문항 ${stats.questions}개 (분석 ${stats.analyzed}개) · 사상가 ${stats.philosophers}명 · 사상가 개념 정리 ${stats.notes}개`,
    extra ?? null,
    CHAT_GUIDE,
  ]);
}

export function sortQuestions(qs: ExportQuestion[]): ExportQuestion[] {
  return [...qs].sort((a, b) => b.year - a.year || a.order - b.order);
}

const ROLE_ORDER: Record<PhilosopherRole, number> = { main: 0, comparison: 1, distractor: 2, mentioned: 3 };

/** 이 사상가가 나온 문항: 주요·비교 먼저, 최근 연도 먼저 */
export function questionsOf(philosopherId: string, qs: ExportQuestion[]): (ExportQuestion & { role: PhilosopherRole })[] {
  return qs
    .flatMap((q) => {
      const link = q.philosophers.find((p) => p.id === philosopherId);
      return link ? [{ ...q, role: link.role }] : [];
    })
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || b.year - a.year || a.order - b.order);
}

/** 사상가 자료가 마지막으로 바뀐 시각: 개념 정리 노트와 관련 문항·분석 중 가장 최근 */
export function philosopherUpdatedAt(p: ExportPhilosopher, qs: ExportQuestion[]): string | null {
  const times = [p.note?.updatedAt, ...questionsOf(p.id, qs).flatMap((q) => [q.updatedAt, q.analysis?.updatedAt])].filter((t): t is string => Boolean(t));
  return times.length ? times.reduce((m, t) => (t > m ? t : m)) : null;
}

/** 분석된 문항은 전부 싣고, 분석 전 문항은 번호만 한 줄로 (채팅 AI 에 쓸모없는 빈 항목을 줄인다) */
function questionList(qs: ExportQuestion[], opt: ExportOptions): string {
  const done = qs.filter((q) => q.analysis);
  const pending = qs.filter((q) => !q.analysis);
  return block([
    done.length ? done.map((q) => questionMarkdown(q, opt)).join("\n\n---\n\n") : "_분석된 문항이 없습니다._",
    pending.length ? `_아직 분석 전인 문항 (${pending.length}): ${pending.map((q) => q.ref).join(", ")}_` : null,
  ]);
}

function profile(p: ExportPhilosopher): string {
  return list([p.tradition && `분류: ${p.tradition}`, p.school && `학파: ${p.school}`, p.era && `시대: ${p.era}`, p.coreIdeas && `핵심 사상: ${p.coreIdeas}`]);
}

/** 사상가 한 명 파일 */
export function philosopherFile(p: ExportPhilosopher, all: ExportQuestion[], opt: ExportOptions, now: Date): string {
  const qs = questionsOf(p.id, all);
  const head = fileHeader(`${p.name} — 기출 분석 자료`, now, {
    questions: qs.length,
    analyzed: qs.filter((q) => q.analysis).length,
    philosophers: 1,
    notes: p.note ? 1 : 0,
  });
  return block([
    head,
    `## 사상가 정보\n\n${profile(p) || "-"}`,
    p.note ? `## AI 개념 정리\n\n${noteMarkdown(p.name, p.note.content)}` : null,
    `## 기출 문항 (${qs.length})\n\n${qs.length ? questionList(qs, opt) : "_등록된 문항이 없습니다._"}`,
  ]) + "\n";
}

/** 여러 사상가를 한 파일로 (전체 또는 섹터별). 문항은 한 번씩만 싣는다 */
export function combinedFile(title: string, ps: ExportPhilosopher[], qs: ExportQuestion[], opt: ExportOptions, now: Date): string {
  const sorted = sortQuestions(qs);
  const byTradition = new Map<string, ExportPhilosopher[]>();
  for (const p of ps) byTradition.set(p.tradition ?? "미분류", [...(byTradition.get(p.tradition ?? "미분류") ?? []), p]);
  const index = [...byTradition.entries()]
    .map(([t, list]) => `- **${t}**: ${list.map((p) => `${p.name}(${questionsOf(p.id, qs).length})`).join(", ")}`)
    .join("\n");
  const notes = ps.filter((p) => p.note);
  return block([
    fileHeader(title, now, { questions: sorted.length, analyzed: sorted.filter((q) => q.analysis).length, philosophers: ps.length, notes: notes.length }),
    `## 목차 — 사상가별 문항 수\n\n${index || "-"}`,
    notes.length ? `## 사상가 개념 정리\n\n${notes.map((p) => block([noteMarkdown(p.name, p.note!.content), profile(p)])).join("\n\n---\n\n")}` : null,
    `## 기출 문항 (최근 연도 순)\n\n${sorted.length ? questionList(sorted, opt) : "_등록된 문항이 없습니다._"}`,
  ]) + "\n";
}

/** ZIP 묶음 첫 파일: 안내와 목록 */
export function indexFile(ps: ExportPhilosopher[], qs: ExportQuestion[], names: Map<string, string>, now: Date, since: string | null): string {
  return block([
    `# 기출 분석 자료 — 사상가별 파일 묶음`,
    `- 내보낸 시각: ${kstStamp(now)} (한국 시간)`,
    since ? `- ${kstStamp(since)} 이후 바뀐 사상가 ${ps.length}명만 담았습니다. 채팅 AI 에 올려 둔 같은 이름의 파일을 이것으로 바꾸세요.` : `- 사상가 ${ps.length}명`,
    `채팅 AI(Claude 프로젝트, ChatGPT 프로젝트·GPTs, NotebookLM 등)에 파일을 올리고 질문하세요. 필요한 사상가 파일만 골라 올려도 됩니다.`,
    `## 파일 목록\n\n${ps.map((p) => `- ${names.get(p.id)} — ${p.name}, 문항 ${questionsOf(p.id, qs).length}개${p.note ? ", 개념 정리 포함" : ""}`).join("\n")}`,
  ]) + "\n";
}

// ---------------------------------------------------------------------
// 내려받는 파일 이름: 브라우저에 따라 한글 파일 이름이 'download' 로 바뀌므로 로마자로 (예: 칸트 → kanteu)
// ---------------------------------------------------------------------
const INITIAL = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
const MEDIAL = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
const FINAL = ["", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "l", "l", "l", "p", "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t"];

export function romanize(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)! - 0xac00;
    if (c >= 0 && c < 11172) out += INITIAL[Math.floor(c / 588)] + MEDIAL[Math.floor((c % 588) / 28)] + FINAL[c % 28];
    else out += /[a-z0-9]/i.test(ch) ? ch.toLowerCase() : "-";
  }
  return out.replace(/-+/g, "-").replace(/^-|-$/g, "") || "file";
}
