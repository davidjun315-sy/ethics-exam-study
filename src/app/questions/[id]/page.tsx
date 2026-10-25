import { notFound } from "next/navigation";
import { DataError, load } from "@/components/DataError";
import { QuestionStudy } from "@/components/study/QuestionStudy";
import { isAdmin } from "@/lib/admin-guard";
import { getQuestionDetail } from "@/lib/data/queries";
import { findRelatedQuestions } from "@/lib/data/related";

export default async function QuestionPage({ params }: PageProps<"/questions/[id]">) {
  const { id } = await params;
  const { data, error } = await load(async () => {
    const [detail, related, admin] = await Promise.all([getQuestionDetail(id), findRelatedQuestions(id), isAdmin()]);
    return { detail, related, admin };
  });
  if (error || !data) return <DataError error={error} />;
  if (!data.detail) notFound();
  return <QuestionStudy detail={data.detail} related={data.related} isAdmin={data.admin} />;
}
