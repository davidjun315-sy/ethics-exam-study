import { notFound } from "next/navigation";
import { ExamAdmin } from "@/components/admin/ExamAdmin";
import { DataError, load } from "@/components/DataError";
import { getExam, getExamPages, listQuestionSummaries } from "@/lib/data/queries";

export default async function AdminExamPage({ params, searchParams }: PageProps<"/admin/exams/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const { data, error } = await load(async () => {
    const [exam, pages, questions] = await Promise.all([getExam(id), getExamPages(id), listQuestionSummaries({ examId: id })]);
    return { exam, pages, questions };
  });
  if (error || !data) return <DataError error={error} />;
  if (!data.exam) notFound();
  return (
    <ExamAdmin
      exam={data.exam}
      pages={data.pages}
      questions={data.questions}
      justSegmented={typeof sp.segmented === "string" ? Number(sp.segmented) : null}
    />
  );
}
