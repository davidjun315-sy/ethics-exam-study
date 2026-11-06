# ETHOS 앱 아이콘 (홈 화면 추가 · PWA)

**적용됨** — 사용자가 제공한 신전 일러스트(1254px)로 아래 파일을 만들었습니다 (검은 모서리는 주변 파란 배경으로 채워 정사각형 전체를 채움). 교체할 때는 같은 이름으로 덮어쓰면 **코드 수정 없이 자동으로 연결**됩니다
(`src/app/manifest.ts`, `src/app/layout.tsx` 가 파일이 있을 때만 연결).

| 파일 (경로 그대로) | 크기 | 용도 | 비고 |
|---|---|---|---|
| `public/apple-touch-icon.png` | 180×180 | 아이폰·아이패드 홈 화면 | 투명 배경 금지 (iOS 가 검정으로 채움). 모서리는 iOS 가 자동으로 둥글게 깎음 → 사각형 그대로 |
| `public/icons/icon-192.png` | 192×192 | 안드로이드 홈 화면 · 앱 목록 | `purpose: any` |
| `public/icons/icon-512.png` | 512×512 | 안드로이드 설치 화면 · 스플래시 | `purpose: any` |
| `public/icons/icon-maskable-512.png` | 512×512 | 안드로이드 적응형 아이콘 | 핵심 도형을 가운데 **지름 80% 원(약 410px)** 안에 두고 바깥은 배경색으로 채움 |
| `src/app/favicon.ico` (선택) | 16·32·48 | 브라우저 탭 | Next.js 가 자동 인식 |

## 디자인 기준

- 브랜드 마크: 둥근 사각형 안의 열주(위 지붕·들보, 기둥 3개, 아래 기단) — 화면 왼쪽 위 로고와 같은 형태 (`src/components/brand/Logo.tsx` 의 SVG 를 원본으로 사용 가능)
- 배경: 대각선 그라디언트 `#6d8ae0 → #2f4692`, 도형은 흰색
- 글자(ETHOS)는 아이콘에 넣지 않음 (작은 크기에서 읽히지 않음). 홈 화면 이름은 manifest 의 `short_name: ETHOS`
- PNG, sRGB, 압축 권장

## 만들기 (예시)

SVG 원본을 512px 로 내보낸 뒤 크기별로 줄입니다. maskable 은 같은 그림을 80% 크기로 줄여 가운데에 두고 배경 그라디언트를 끝까지 채웁니다.
확인: https://maskable.app 에서 미리보기.

## 이미 설정된 항목

- 앱 이름 `ETHOS 에토스 — 도덕·윤리 학습 플랫폼`, 짧은 이름 `ETHOS`, `display: standalone`, `lang: ko`
- 테마 색 라이트 `#f6f7fb` / 다크 `#101827` (다크 모드 전환 시 상태 표시줄 색도 바뀜)
- iOS: `apple-mobile-web-app-capable`, 제목 `ETHOS`, 상태 표시줄 `default`
- `viewport-fit=cover` + safe-area: 상단 헤더·하단 탭이 노치와 홈 인디케이터를 피함
- 모바일 입력창 글자 16px (iOS 확대 방지), 키보드가 올라오면 화면 크기 조정(`interactive-widget=resizes-content`)
