import { notFound } from "next/navigation";
import { DataError, load } from "@/components/DataError";
import { QuestionStudy } from "@/components/study/QuestionStudy";
import { isAdmin } from "@/lib/admin-guard";
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
    return { detail, related, admin, extensionMatches };
  });
  if (error || !data) return <DataError error={error} />;
  if (!data.detail) notFound();
  return <QuestionStudy detail={data.detail} related={data.related} isAdmin={data.admin} extensionMatches={data.extensionMatches} />;
}
