import { notFound } from "next/navigation";
import { QuestionEditor } from "@/components/admin/QuestionEditor";
import { DataError, load } from "@/components/DataError";
import { getExamPages, getQuestionDetail } from "@/lib/data/queries";

export default async function AdminQuestionPage({ params, searchParams }: PageProps<"/admin/questions/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const { data, error } = await load(async () => {
    const detail = await getQuestionDetail(id);
    const pages = detail ? await getExamPages(detail.exam.id) : [];
    return { detail, pages };
  });
  if (error || !data) return <DataError error={error} />;
  if (!data.detail) notFound();
  return <QuestionEditor detail={data.detail} pages={data.pages} recropHint={sp.recrop === "1"} />;
}
