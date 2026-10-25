import { DataManager } from "@/components/admin/DataManager";
import { DataError, load } from "@/components/DataError";
import { PageTitle } from "@/components/ui";
import { getReadClient } from "@/lib/supabase/server";

export const metadata = { title: "데이터 관리" };

export default async function AdminDataPage({ searchParams }: PageProps<"/admin/data">) {
  const sp = await searchParams;
  const tab = (typeof sp.tab === "string" ? sp.tab : "philosophers") as "philosophers" | "concepts" | "sources" | "source_passages";
  const { data, error } = await load(async () => {
    const db = getReadClient();
    const [p, c, s, sp2] = await Promise.all([
      db.from("philosophers").select("*").order("name"),
      db.from("concepts").select("*").order("name"),
      db.from("sources").select("*").order("title"),
      db.from("source_passages").select("*").order("created_at", { ascending: false }).limit(500),
    ]);
    for (const r of [p, c, s, sp2]) if (r.error) throw new Error(r.error.message);
    return { philosophers: p.data ?? [], concepts: c.data ?? [], sources: s.data ?? [], passages: sp2.data ?? [] };
  });
  if (error || !data) return <DataError error={error} />;
  return (
    <div>
      <PageTitle title="사상가 · 개념 · 원전 관리" subtitle="AI 가 자동 등록한 항목을 정리하거나, 원전 원문·번역문을 직접 추가합니다." />
      <DataManager tab={tab} {...data} />
    </div>
  );
}
