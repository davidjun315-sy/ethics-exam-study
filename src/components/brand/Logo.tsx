/**
 * ETHOS 브랜드 마크: 둥근 사각형 안의 열주(列柱) — 위·아래 들보와 세 기둥.
 * 고대 그리스의 '에토스(ἦθος, 성품·습관)'와 꾸준히 쌓는 학습을 상징. 글자는 ETHOS 워드마크.
 */
export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="ethos-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6d8ae0" />
          <stop offset="1" stopColor="#2f4692" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#ethos-g)" />
      <path d="M7.5 9.2 16 5.8l8.5 3.4z" fill="#fff" opacity="0.95" />
      <rect x="7.5" y="10.4" width="17" height="1.8" rx="0.6" fill="#fff" opacity="0.95" />
      <rect x="9.2" y="13.4" width="2.2" height="9.4" rx="0.6" fill="#fff" opacity="0.85" />
      <rect x="14.9" y="13.4" width="2.2" height="9.4" rx="0.6" fill="#fff" opacity="0.85" />
      <rect x="20.6" y="13.4" width="2.2" height="9.4" rx="0.6" fill="#fff" opacity="0.85" />
      <rect x="6.5" y="23.9" width="19" height="2" rx="0.7" fill="#fff" opacity="0.95" />
    </svg>
  );
}

export function Logo({ sub = false }: { sub?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="text-[17px] font-extrabold tracking-[0.18em] text-ink">ETHOS</span>
        {sub && <span className="mt-0.5 text-[10px] font-medium tracking-[0.08em] text-faint">에토스</span>}
      </span>
    </span>
  );
}
