/**
 * ETHOS 브랜드 마크: 앱 아이콘(신전 일러스트)과 같은 그림을 둥근 모서리로.
 * 원본: public/brand/ethos-mark.png (144px, 작은 크기에서도 선명하게)
 */
export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/ethos-mark.png"
      alt=""
      aria-hidden
      width={144}
      height={144}
      draggable={false}
      className={`shrink-0 rounded-[24%] object-cover shadow-[0_1px_2px_rgba(15,22,38,0.25)] ring-1 ring-black/5 dark:ring-white/10 ${className}`}
    />
  );
}

export function Logo({ sub = false }: { sub?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <LogoMark className="h-8 w-8" />
      <span className="flex flex-col leading-none">
        <span className="text-[17px] font-extrabold tracking-[0.18em] text-ink">ETHOS</span>
        {sub && <span className="mt-0.5 text-[10px] font-medium tracking-[0.08em] text-faint">에토스</span>}
      </span>
    </span>
  );
}
