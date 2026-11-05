/**
 * 페이지를 옮길 때 바로 보여 주는 뼈대 화면.
 * 링크를 누르면 서버가 데이터를 읽는 동안 이전 화면에 멈춰 있지 않고 곧바로 이 화면으로 바뀐다.
 * 이미 보이는 로딩 경계 안에서의 이동은 React 가 이전 화면을 유지하므로, 경로 폴더마다 loading.tsx 를 둔다.
 */
export function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-4" role="status" aria-label="불러오는 중">
      <div className="space-y-2">
        <div className="h-7 w-48 rounded bg-surface-2" />
        <div className="h-4 w-80 max-w-full rounded bg-surface-2" />
      </div>
      <div className="h-10 w-full rounded-lg bg-surface-2" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="card space-y-2 p-4">
            <div className="h-4 w-1/2 rounded bg-surface-2" />
            <div className="h-3 w-full rounded bg-surface-2" />
            <div className="h-3 w-4/5 rounded bg-surface-2" />
          </div>
        ))}
      </div>
      <span className="sr-only">불러오는 중…</span>
    </div>
  );
}
