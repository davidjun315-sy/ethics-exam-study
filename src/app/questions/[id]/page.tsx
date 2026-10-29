import { notFound } from "next/navigation";
import { DataError, load } from "@/components/DataError";
import { QuestionStudy } from "@/components/study/QuestionStudy";
import { isAdmin } from "@/lib/admin-guard";
import { currentLearner } from "@/lib/quiz/learn";
import { getMemo } from "@/lib/data/memos";
import { getQuestionDetail } from "@/lib/data/queries";
import { findQuestionsForTopics, findRelatedQuestions } from "@/lib/data/related";

export default async function QuestionPage({ params }: PageProps<"/questions/[id]">) {
  const { id } = await params;
  const { data, error } = await load(async () => {
    const [detail, related, admin] = await Promise.all([getQuestionDetail(id), findRelatedQuestions(id), isAdmin()]);
    const extensions = detail?.analysis?.details?.futureExtensions ?? [];
    const extensionMatches = await findQuestionsForTopics(
      extensions.map((e) => ({ concepts: e.relatedConcepts ?? [], philosophers: e.relatedPhilosophers ?? [] })),
      id,
    );
    // 내 메모는 로그인한 학습자(회원 / 관리자) 것만 서버에서 읽는다
    const learner = await currentLearner();
    const memo = learner ? await getMemo(learner, id) : null;
    return { detail, related, admin, extensionMatches, memo, signedIn: Boolean(learner) };
  });
  if (error || !data) return <DataError error={error} />;
  if (!data.detail) notFound();
  return <QuestionStudy detail={data.detail} related={data.related} isAdmin={data.admin} extensionMatches={data.extensionMatches} memo={data.memo} signedIn={data.signedIn} />;
}
