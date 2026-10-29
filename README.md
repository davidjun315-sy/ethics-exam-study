# ethics-exam-study

윤리 임용고시(중등 도덕·윤리) **기출 데이터베이스 + AI 기출 분석기 + 개인 학습 사이트**입니다.

기출 PDF 를 올리면 페이지를 렌더링하고, 2단 편집을 고려해 문항을 자동으로 나누고, 문항마다 AI 가
사상가·개념·원전·정답·답안 포인트를 구조화된 JSON 으로 분석합니다. 분석 결과는 사상가별 / 개념별 /
원전별로 연결되어 쌓이고, 출제 경향 통계와 유사 기출 찾기에 쓰입니다.

- 회원가입·계정 없음. URL 을 아는 사람(같이 공부하는 친구)은 누구나 열람할 수 있습니다.
- PDF 업로드와 데이터 수정은 `/admin` (관리자 비밀번호) 에서만 가능합니다.
- 내 답안·북마크·오답·메모 같은 개인 기록은 **각자의 브라우저(localStorage)** 에만 저장됩니다.

> 상업 서비스가 아닌 개인 학습용 사이트입니다. AI 분석은 틀릴 수 있으므로 원전·공식 자료로 확인하세요.

---

## 목차

1. [주요 기능](#1-주요-기능)
2. [구조 한눈에 보기](#2-구조-한눈에-보기)
3. [Node.js 설치](#3-nodejs-설치)
4. [프로젝트 받기 / npm install](#4-프로젝트-받기--npm-install)
5. [Supabase 프로젝트 만들기](#5-supabase-프로젝트-만들기)
6. [DB schema 적용 + Storage bucket 생성](#6-db-schema-적용--storage-bucket-생성)
7. [환경변수 설정 (.env.local)](#7-환경변수-설정-envlocal)
8. [ADMIN_PASSWORD 설정](#8-admin_password-설정)
9. [AI API Key 입력](#9-ai-api-key-입력)
10. [로컬 실행](#10-로컬-실행)
11. [사용 순서](#11-사용-순서)
12. [GitHub 업로드](#12-github-업로드)
13. [Vercel 배포](#13-vercel-배포)
14. [오류 해결법](#14-오류-해결법)
15. [개발 메모](#15-개발-메모)

---

## 1. 주요 기능

| 영역 | 기능 |
| --- | --- |
| 기출문제 | 학년도 / 전공 A·B 별 시험, 문항 카드(문항 번호·사상가·핵심 개념·정답·난이도·확신도) |
| 문항 상세 | 좌: 원본 문항 이미지 / 우: AI 분석. 탭 — 문제 분석·사상가·개념·원전·답안·관련 기출·내 메모 |
| 문제 풀이 모드 | 기본으로 정답·해설을 숨김. `정답 보기` / `AI 분석 보기` / `원전 보기` 를 따로 열 수 있음 |
| 내 답안 + AI 채점 | 핵심 개념 정확성, 필수 키워드 포함 여부, 완성도, 틀린 표현, 빠진 내용, 수정할 표현, 예상 답안 |
| 사상가 | 학파·시대·핵심 사상·주요 개념·주요 원전·관련 기출·출제 횟수·최근 출제 연도·함께 비교되는 사상가·결정적 표현 |
| 사상가 비교 | 인간관·본성론·도덕 원리·수양론·정치관·핵심 개념·대표 원전·구별 표현·관련 기출 (생성 결과는 DB 에 캐시) |
| 개념 / 원전 | 정의·관련 사상가·관련 원전·관련 기출·유사/혼동 개념 / 원전 핵심 내용·출제된 문장·원문·번역문 |
| 출제분석 | 연도별 사상가 빈도(히트맵), 사상가·개념·원전별 횟수, 영역 비율, 최근 5년, 반복 출제 개념, 오래 안 나온 사상가, 전공 A/B 비교 |
| 통합검색 | 사상가·개념·원전·문제 텍스트·연도·정답 해설을 한 화면에 |
| 내 학습 기록 | 푼 문제·북마크·오답·다시 볼 문제·학습 완료·메모 (브라우저별 저장, JSON 내보내기/가져오기) |
| 관리자 | PDF 업로드(클릭/드래그, 미리보기, 파일명·크기·페이지 수), 중복 PDF 차단(SHA-256), 시험 등록·수정·삭제, 페이지 분석, 문항 수정·영역 수정·합치기·나누기·삭제, AI 분석 / 부분 재분석, 분석·사상가·개념·원전 수정, 원전 원문·번역문 DB 입력 |

### AI 분석 항목

- **기본 정보**: 출제 영역, 사상가(복수, 역할 main/comparison/distractor/mentioned), 학파, 시대, 핵심 개념, 관련 사상가, 관련 원전, 문제 유형, 난이도
- **사상가 판별 근거**: 결정적 표현, 판별 근거, 유사 사상가와 구별 포인트
- **문제 분석**: 요구하는 것, 핵심 단서, 제시문 분석, 풀이 과정, 정답, 정답 근거, 해설
- **임용 답안**: 모범답안, 필수 키워드, 채점 포인트, 포함하면 좋은 표현, 감점 위험 요소
- **오답 분석**: 혼동 사상가·개념, 틀리기 쉬운 이유, 오답 포인트
- **원전 분석**: 사상가, 원전명, 권/편/장, 관련 내용, 제시문과의 관계, 확인 수준(`confirmed`/`likely`/`candidate`/`unknown`), 확신도
- **확신도**: 사상가 / 정답 / 원전 / 개념 / 전체 (0~1 저장, 화면은 %). 원전·전체 확신도가 60% 미만이면 `검토 필요`

### 환각 방지 장치

- 모든 프롬프트 공통 규칙(`prompts/shared-rules.ts`): 모르면 모른다고, 추정과 확인 구분, 장·절 지어내지 않기, 복수 사상가 고려, 애매하면 검토 필요, 해석이 갈리면 단정 금지
- AI 응답은 자유 텍스트가 아니라 **JSON Schema 구조화 출력 + Zod 검증**
- AI 가 `confirmed` 라고 답해도 원전 DB 와 대조되지 않았으면 서버가 `likely` 로 낮춰 저장
- 관리자가 확인한 사상가·개념·원전 연결은 `is_manual=true` 로 저장되어 재분석해도 지워지지 않음
- AI 원본(`ai_original`)과 관리자 수정 결과(`edited_fields`)를 분리 저장

---

## 2. 구조 한눈에 보기

```
PDF 업로드 (브라우저)
  → SHA-256 계산 → 중복 확인 → 시험 등록 → Storage(exam-pdfs) 에 직접 업로드 (signed URL)
  → [브라우저] pdf.js 로 페이지 렌더링 → 페이지 이미지 생성 → 텍스트 레이어 추출
  → 레이아웃 분석(머리말/꼬리말 제거, 2단 편집 단 구분선 탐지, 줄 묶기)
  → 문항 번호 탐지(왼쪽 여백 + 번호 연속성) → 문항 영역 분리(여러 단/페이지 걸침 지원)
  → 문항 이미지 생성 → Storage(question-images) 업로드 → DB 저장
  → [서버] 문항 단위 AI 분석 (Claude 또는 OpenAI, 이미지 + 텍스트)
  → 사상가·개념·원전 관계형 저장 → 사상가/개념/원전/출제분석 화면
```

- 스캔 PDF(텍스트 레이어 없음)는 페이지 단위 임시 문항을 만들고, AI 가 이미지(vision)를 읽어 원문(`transcribedText`)을 채웁니다. 관리자 화면에서 문항을 나누면 됩니다.
- PDF 처리를 브라우저에서 하는 이유: 서버리스(Vercel)에 canvas 같은 네이티브 의존성을 두지 않고, 요청 크기 제한(4.5MB)도 피하기 위해서입니다.

### 기술 스택

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres + Storage) · Zod · pdf.js · Anthropic SDK

### 폴더 구조

```
ethics-exam-study/
├─ prompts/                      AI 프롬프트 (코드와 분리)
│  ├─ shared-rules.ts            공통 환각 방지 규칙
│  ├─ question-analysis.ts       문항 분석 / 부분 재분석
│  ├─ source-analysis.ts         원전 분석
│  ├─ answer-grading.ts          답안 채점
│  └─ philosopher-comparison.ts  사상가 비교
├─ supabase/schema.sql           DB 스키마 + RLS + Storage 버킷
├─ scripts/
│  ├─ copy-pdf-worker.mjs        pdf.js worker/cMap 을 public/pdfjs 로 복사 (postinstall)
│  └─ test-segment.ts            문항 자동 분리 테스트 (npm run test:segment -- file.pdf)
└─ src/
   ├─ proxy.ts                   /admin 접근 시 세션 확인 (Next 16 의 middleware)
   ├─ app/
   │  ├─ page.tsx                홈 대시보드
   │  ├─ exams/ questions/ philosophers/ concepts/ sources/ trends/ search/ my/
   │  ├─ admin/                  관리자 (login, upload, exams/[id], questions/[id], data)
   │  └─ api/
   │     ├─ admin/...            관리자 API (모두 서버에서 세션 검증)
   │     ├─ grade/               AI 채점 (공개, IP 별 횟수 제한)
   │     └─ compare/             사상가 비교 (공개, 결과 캐시)
   ├─ components/                UI (study/, admin/, ui/)
   └─ lib/
      ├─ ai/provider.ts          공통 AI interface + provider 선택
      ├─ ai/anthropic.ts         Claude 구현
      ├─ ai/openai.ts            OpenAI 구현
      ├─ ai/schemas.ts           AI 응답 Zod 스키마
      ├─ pdf/segment.ts          레이아웃 분석 + 문항 분리 (순수 함수)
      ├─ pdf/extract.ts          pdf.js 텍스트 좌표 추출
      ├─ pdf/browser.ts          렌더링 / 크롭 (브라우저)
      ├─ data/queries.ts         조회
      ├─ data/analysis.ts        AI 분석 실행 + 저장
      ├─ data/related.ts         유사 기출 (태그 기반, embedding 확장 가능)
      ├─ local-study.ts          localStorage 학습 기록
      └─ auth.ts                 관리자 세션 (HMAC 서명 httpOnly cookie)
```

### DB 테이블

| 테이블 | 내용 |
| --- | --- |
| `exams` | 시험 (학년도, 시험명, 과목, 전공 A/B, 비고, PDF URL, **pdf_hash(SHA-256, unique)**, 페이지 수) |
| `exam_pages` | 페이지 이미지, 텍스트 레이어, 스캔 여부 |
| `questions` | 문항 (번호, 하위 문항 번호, 상위 문항, 페이지, **영역 regions(jsonb)**, 원문, 이미지, 배점, 유형) |
| `question_analysis` | 분석 (영역, 난이도, 정답, 해설, 키워드, 상세 `details`, 확신도 5종, 상태, `ai_original`, `edited_fields`) |
| `philosophers` / `concepts` / `sources` | 마스터 데이터 (별칭 aliases 포함) |
| `source_passages` | 원전 원문 / 번역문 / 출처 / 권·장·페이지 / 관련 개념 |
| `question_philosophers` | 문항 ↔ 사상가 (역할, 확신도, 판별 근거) |
| `question_concepts` | 문항 ↔ 개념 |
| `question_sources` | 문항 ↔ 원전 (위치, 확인 수준, 확신도, 출제된 문장) |
| `concept_philosophers` | 개념 ↔ 사상가 |
| `analysis_runs` | AI 호출 기록 (범위, 모델, 토큰, 원본 응답, 오류) |
| `philosopher_comparisons` | 사상가 비교 캐시 |
| `philosopher_notes` | 사상가 개념 정리 노트 (채팅 AI 정리 결과, 기준 문항, 출처, 직접 수정 여부) |
| `quiz_items` | 윤리 퀴즈 문제은행 (기출 세부 문제 · AI 예상 문제). 원본 문항 id + 요구 사항 레이블로 연결, 해설은 분석을 그때그때 읽음 |
| `quiz_progress` / `quiz_attempts` | 문제별 숙련도·복습 일정 / 풀이 기록 (자동 채점 · 자기평가 구분) |
| `quiz_daily` / `quiz_profiles` / `quiz_settings` / `quiz_reports` | 일일 미션 / XP·연속 학습·배지 / 미션 구성 / 오답 검수 요청 |
| `study_memos` | 내 메모 (공개 읽기 없음 — 관리자 로그인 상태에서 서버가 읽고 씀) |

---

## 3. Node.js 설치

1. <https://nodejs.org> 에서 **LTS 버전(20 이상, 22 권장)** 을 설치합니다.
2. 터미널(Windows: PowerShell, Mac: 터미널)에서 확인합니다.

```bash
node -v   # v20.9 이상
npm -v
```

## 4. 프로젝트 받기 / npm install

```bash
# GitHub 에 올린 뒤라면
git clone https://github.com/<내-아이디>/ethics-exam-study.git
cd ethics-exam-study

npm install
```

`npm install` 이 끝나면 `postinstall` 이 pdf.js worker 를 `public/pdfjs/` 로 자동 복사합니다.

## 5. Supabase 프로젝트 만들기

1. <https://supabase.com> 가입 → **New project**
2. 이름: `ethics-exam-study`, 데이터베이스 비밀번호 입력, Region 은 `Northeast Asia (Seoul)` 권장
3. 생성이 끝나면 **Project Settings → API** (또는 **Connect** 버튼) 에서 다음 값을 확인합니다.
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key (또는 Publishable key) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` `secret` key (또는 Secret key) → `SUPABASE_SERVICE_ROLE_KEY` (**절대 공개 금지**)

## 6. DB schema 적용 + Storage bucket 생성

1. Supabase 대시보드 → **SQL Editor** → **New query**
2. 이 저장소의 `supabase/schema.sql` 내용을 전부 붙여넣고 **Run**
3. 테이블, 인덱스, RLS 정책(누구나 읽기 / 쓰기는 서버만), Storage 버킷 2개가 만들어집니다.
   - `exam-pdfs` (public, PDF 전용, 100MB)
   - `question-images` (public, 이미지 전용, 20MB)
4. **Storage** 메뉴에서 두 버킷이 보이는지 확인합니다.
   SQL 로 버킷이 만들어지지 않았다면 Storage → **New bucket** 에서 위 이름으로 직접 만들고 **Public bucket** 을 켜세요.

> schema.sql 은 여러 번 실행해도 안전합니다(`if not exists`). 스키마가 바뀌면 다시 실행하면 됩니다.
>
> 버킷을 public 으로 두는 이유: 친구들이 로그인 없이 문항 이미지를 봐야 하고, AI API 가 이미지 URL 을 직접 읽어야 하기 때문입니다.
> 업로드는 서버가 발급한 signed URL 로만 가능합니다.

## 7. 환경변수 설정 (.env.local)

```bash
cp .env.example .env.local      # Windows PowerShell: copy .env.example .env.local
```

`.env.local` 을 열어 채웁니다.

| 변수 | 필수 | 설명 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | anon(public) key — 브라우저에 노출되어도 되는 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | service_role key — **서버 전용** |
| `ADMIN_PASSWORD` | ✅ | 관리자 비밀번호 |
| `ADMIN_SESSION_SECRET` | | 세션 서명 비밀값 (비우면 비밀번호에서 파생) |
| `AI_PROVIDER` | ✅ | `anthropic` 또는 `openai` |
| `AI_MODEL` | | 비우면 `claude-opus-5-5` / `gpt-5` |
| `AI_EFFORT` | | Claude 사고 깊이 `low`~`max`, 기본 `high` |
| `ANTHROPIC_API_KEY` | AI_PROVIDER=anthropic 일 때 | |
| `OPENAI_API_KEY` | AI_PROVIDER=openai 일 때 | |
| `PUBLIC_AI_GRADING` | | `false` 이면 AI 채점을 관리자만 사용 |

`.env.local` 은 `.gitignore` 에 들어 있어 GitHub 에 올라가지 않습니다. **실제 키를 `.env.example` 이나 코드에 적지 마세요.**

## 8. ADMIN_PASSWORD 설정

- `.env.local` 의 `ADMIN_PASSWORD=` 뒤에 길고 추측하기 어려운 비밀번호를 적습니다.
- 비밀번호는 서버에서만 비교되고(SHA-256 상수 시간 비교), 로그인에 성공하면 7일짜리 **httpOnly 쿠키**가 발급됩니다.
- 로그인 시도는 IP 당 10분에 10회로 제한됩니다.
- 비밀번호를 바꾸면(또는 `ADMIN_SESSION_SECRET` 을 바꾸면) 기존 로그인은 모두 풀립니다.

## 9. AI API Key 입력

### Claude (기본)

1. <https://console.anthropic.com> → **API Keys** → Create Key
2. **Billing** 에서 결제 수단/크레딧 등록
3. `.env.local`
   ```
   AI_PROVIDER=anthropic
   AI_MODEL=claude-opus-5-5
   ANTHROPIC_API_KEY=sk-ant-...
   ```
   - 비용을 줄이고 싶으면 `AI_MODEL=claude-sonnet-5-5` 또는 `AI_EFFORT=medium` 으로 바꿀 수 있습니다. (정확도가 떨어질 수 있음)

### OpenAI

```
AI_PROVIDER=openai
AI_MODEL=gpt-5            # 사용 가능한 vision + JSON Schema 지원 모델
OPENAI_API_KEY=sk-...
```

### API 없이 쓰기 — 셀프 분석 (채팅 AI 결과 붙여넣기)

API 키나 크레딧이 없어도, 이미 쓰고 있는 Claude · ChatGPT · Gemini **채팅 화면**으로 분석할 수 있습니다.

1. 관리자 → 문항 수정 화면 → **셀프 분석** 섹션에서 `분석 프롬프트 복사`
2. 채팅창에 붙여넣기 (정확도를 높이려면 `문항 이미지 열기`로 이미지를 저장해 함께 첨부)
3. AI 가 준 답(```json … ```)을 통째로 복사해 붙여넣고 `검사하고 저장`

API 분석과 같은 규칙 · 같은 JSON 양식을 쓰고, 같은 Zod 검사를 거쳐 똑같이 저장됩니다.
(빠진 항목은 기본값으로 채우고, 양식이 틀리면 어디가 틀렸는지 알려줍니다.) 단, 친구들이 쓰는 **AI 채점**은 API 키가 있어야 동작합니다.

### 심화 문항 분석 · 전체 기출 출제 예측 (v2)

**개별 문항** — 공부 흐름: `출제 의도 → 개념 정리 → 문제 분석·답안 → 향후 출제`
- **출제 의도**: 출제자가 왜 이 문제를 냈는지, 확인하려는 능력, 문제 유형(판별·정의·비교·원전·표현 찾기·적용·비판·서술·암기), 답안에 꼭 써야 할 개념어, 노린 오개념, 판단 근거(제시문 인용)
- **개념 정리**: 필수 / 보조 / 함께 비교할 개념으로 나눠 정의 · 시험 포인트 · 이 문제와의 연결 · 혼동 개념 · 구별법
- **향후 출제**: 이 문항의 개념이 앞으로 어떻게 변형·확장 출제될 수 있는지 (예상 주제, 방식, 근거, 가능성, 중요도). *관련 기존 기출은 AI 가 아니라 DB 에서 개념·사상가가 실제로 겹치는 문항을 연결*

**전체 기출** — `출제분석` 메뉴의 세 탭
- **통계 분석**: 기존 통계
- **출제 패턴** (AI 호출 없음, DB 계산): 반복 증가 / 감소, 재출제 주기, 비교 조합 반복, 출제 방식 반복, 같은 사상가+다른 개념, 같은 개념+다른 사상가, 사상가·개념·원전별 상세 패턴(하위 패턴 예: `주희와 비교 2회 / 단독 1회`, 미출제 주요 개념, 원전 미출제 부분)
- **출제 예측**: 다음 시험 대비 우선 학습 주제 TOP 10. 각 주제마다 추천 점수(0~100)와 점수 요소(역사적 빈도 · 최근 빈도 · 미출제 기간 · 개념 확장 가능성 · 원전 공백 · 비교 조합 공백 · 최근 추세), **DB 에서 계산한 사실**과 **AI 해석**을 분리해서 표시, 근거 기출, 함께 공부할 개념, 예상 연습문제

> 출제 예상은 과거 기출의 반복성과 출제 공백, 개념 분포 등을 기반으로 한 학습 우선순위 분석이며 실제 시험 출제를 보장하지 않습니다. 추천 점수는 확률이 아닙니다.

계층적 분석 구조 (전체 PDF 를 AI 에 다시 넣지 않음):
`문항별 구조화 분석 → 사상가/개념/원전/연도별 집계(src/lib/trends/patterns.ts) → 예측 점수(src/lib/trends/scoring.ts) → 상위 15개 주제의 요약 데이터만 AI 에 전달 → 해석`

비용: 패턴과 점수는 무료(계산). 결과는 `prediction_runs` 에 저장되어 페이지를 볼 때마다 다시 계산하거나 AI 를 부르지 않습니다. 시험·분석이 바뀌면 `전체 분석 업데이트 필요` 가 표시되고, 관리자가 `전체 분석 업데이트` 를 누를 때만 다시 계산합니다. AI 해석과 예상 문제는 API 또는 채팅 붙여넣기로 받을 수 있습니다.

#### 기존 DB 업그레이드 (v1 → v2)
1. Supabase SQL Editor 에서 `supabase/migrations/002_deep_analysis_and_predictions.sql` 실행 (또는 `schema.sql` 전체 다시 실행 — 둘 다 여러 번 실행해도 안전)
2. 이미 분석된 문항은 그대로 보이며, 새 탭에 "이전 버전으로 분석되어…" 안내가 나옵니다. 관리자 화면에서
   - API: 문항 수정 → `심화 분석 (출제 의도·개념 정리·향후 출제)` 또는 시험 화면의 재분석 메뉴 → `심화 분석 추가`
   - API 없이: 문항 수정 → 셀프 분석 → `심화 분석만` 선택 → 프롬프트 복사 / 붙여넣기
   으로 새 항목만 추가합니다. (전체 재분석보다 저렴)
3. `출제분석 → 출제 예측` 에서 `전체 분석 업데이트 (계산)`

점검 스크립트: `npm run test:trends` (패턴·점수 계산을 합성 데이터로 검증)

### 문항 분석 화면 (v3)

문항 화면의 탭 순서: **답안 → 출제 의도 → 원문 해설 → 개념 정리 → 원전 → 향후 출제 → 관련 기출 → 내 메모**

- 답안: 모범답안, 요구 사항(㉠·(가)·작성 방법 조건)별 해설 — 근거가 되는 제시문 인용 + 왜 그것이 정답인지, 전체 해설, 오답 분석
- 출제 의도: 이 문제가 나온 이유 + 요구 사항별 출제 의도
- 원문 해설: 제시문을 부분별로 나눠 원문과 풀이
- 개념 정리: 사상가별 키워드 구조도(이 문항의 핵심 개념을 중심에 두고 관련 개념을 관계와 함께 연결) → 개념별 설명(정의·시험 포인트·이 문제에서·구별). 구조도가 없는 이전 분석은 개념 목록에서 자동으로 만듭니다.
- 원전: 원전 해설(어떤 저작인지·구성·핵심 주제) + 관련 부분의 자세한 내용
- 향후 출제: 사상가의 구체적 개념 + 실제 임용 형식의 예상 문제와 예상 답안
- 정답 한 줄 요약·채점 키워드는 화면에 보이지 않지만 AI 채점과 사상가 개념 정리 노트에 쓰입니다.
- 이전 형식(v2 이하)으로 분석된 문항은 그대로 보이며 "이전 형식" 안내가 나옵니다. 새 형식으로 바꾸려면 전체 재분석(API) 또는 셀프 분석 `전체` 로 다시 붙여넣으세요.

#### 내 메모 (모든 기기)
- 관리자 비밀번호로 로그인한 상태에서 적은 메모는 서버(`study_memos`)에 저장되어 휴대폰·다른 컴퓨터에서도 보입니다. 로그인은 7일 유지됩니다.
- `내 학습 → 메모 모아보기` 에서 섹터(동양윤리·서양윤리 …) → 사상가별로 모아 봅니다.
- 로그인 전에 적은 메모는 그 브라우저에만 있으며, 로그인 후 `서버로 옮기기` 로 옮길 수 있습니다.
- 기존 DB 는 Supabase SQL Editor 에서 `supabase/migrations/004_answer_commentary_and_memos.sql` 을 한 번 실행하세요.

### 윤리 퀴즈

메뉴 `윤리 퀴즈`. 실제 기출을 답 하나 단위로 나눈 문제를 매일 풀고, 틀린 문제를 알맞은 때에 다시 푸는 반복 학습입니다.

- **문제은행**: 문항별 AI 분석의 요구 사항별 해설(㉠·㉡·작성 방법 조건)로 문제를 나누고, '향후 출제'의 예상 문제(문제 + 예상 답안)를 가져옵니다. 한 화면에는 한 문제만: 발문·제시문은 그대로 두고 <작성 방법> 아래에는 그 문제의 조건 줄만 보여 줍니다. 같은 조건 줄을 가리키는 요구 사항(예: "㉢, ㉣의 의미를 순서대로 서술할 것")은 한 문제로 묶습니다. 저장된 원문은 바꾸지 않습니다. 요구 사항별 해설이 없는 이전 형식 분석은 문제로 만들지 않으며 관리 화면에 '재분석 필요'로 보입니다. AI 호출은 없습니다.
- **채점**: 기입형은 서버가 채점합니다 (띄어쓰기·문장부호·괄호 병기 차이는 무시, 정답 목록에 있는 표현만 인정). 서술형은 모범답안·해설을 본 뒤 자기평가(완벽 / 일부 / 틀림)합니다. 오답 처리된 답은 학습자가 검수 요청 → 관리자가 인정하면 정답 목록에 추가됩니다.
- **해설**: 문제마다 복사하지 않고 기존 분석(요구 사항별 해설, 원문 해설, 개념 정리, 출제 의도, 관련 기출)을 그때그때 읽습니다. 분석을 고치면 해설에도 바로 반영됩니다.
- **일일 미션**: 한국 시간 기준 하루 10문제 (기본: 기출 6 · 예상 2 · 복습 2, 관리자 설정에서 변경). 같은 원문에서 나온 문제는 한 미션에 하나, 영역은 섞어서. 중간에 나가도 이어서 풉니다.
- **반복 학습**: 맞힘 → 1일 · 3일 · 점점 길게 / 일부만 → 2일 뒤 / 틀림 → 다음 학습에 우선. (`src/lib/quiz/srs.ts`)
- **성장**: 문제당 XP(같은 문제는 하루 한 번만), 미션 완료 보너스, 연속 학습 보너스, 틀렸던 문제를 맞히면 추가. 레벨(XP)과 숙련도(문제별 0~5)는 따로 계산합니다. 7·30·100·365일 배지, 학습 달력, 영역·사상가별 숙련도.
- **시작 난이도**: 입문 / 심화 / 전문가 (언제든 변경). 전문가는 이미 익힌 쉬운 문제를 덜 냅니다.
- **학습자**: 지금은 관리자 비밀번호로 로그인한 본인 한 명입니다 (`currentLearner()` 가 'owner'). 기록은 서버에 저장되어 다른 기기에서도 이어집니다. 여러 사람이 쓰려면 계정 기능(Supabase Auth 등)을 붙이고 이 함수만 바꾸면 됩니다.

관리자 → `윤리 퀴즈 관리`
1. `문제은행 동기화` — 요구 사항별 해설이 있는 모든 기출을 나누고 향후 출제 예상 문제를 가져옵니다. 다시 눌러도 중복이 생기지 않습니다 (키: 원본 문항 + 요구 사항). 문항을 분석·수정하면 그 문항은 자동으로 반영됩니다.
2. `문제 검수` — 분리가 분명한 기출 세부 문제는 자동 공개(설정에서 끌 수 있음), 검수 사유가 있는 문제와 모든 예상 문제는 승인 대기. 미리보기·수정·승인·비공개·일괄 승인. 관리자가 고친 문제는 동기화가 덮어쓰지 않고 '원본 분석 변경됨'만 표시합니다.
3. 원본에서 사라진 문제는 지우지 않고 '출제 중지' — 학습 기록은 그대로 남습니다.
4. 기존 DB 는 Supabase SQL Editor 에서 `supabase/migrations/005_quiz.sql` 을 한 번 실행하세요. 퀴즈 테이블에는 공개 읽기 정책이 없어 서버만 읽고 씁니다.

점검 스크립트: `npm run test:quiz`

#### 원문 텍스트 편집
관리자 → `원문 텍스트 편집` (또는 시험 관리 화면의 같은 버튼). 시험을 고르면 그 시험의 모든 문항 텍스트를 원본 이미지 옆에서 한꺼번에 고칩니다.
- `다듬기` / `모두 다듬기`: PDF 에서 생긴 문장 중간 줄바꿈을 잇고 (1)·(가)·○·발화자·<작성 방법> 단위로 단락을 나눕니다. 글자는 바꾸지 않으며, 저장하기 전까지는 반영되지 않습니다.
- 문항마다 퀴즈 점검 표시: `퀴즈 N문제 · 조건 N줄` / `조건 줄을 못 찾음: ㉢` / `<작성 방법> 없음`.
- 저장(또는 Ctrl+S)하면 문항 화면과 윤리 퀴즈에 바로 반영됩니다. 저장하지 않고 나가려 하면 확인합니다.

점검 스크립트: `npm run test:tidy`

### 사상가 개념 정리 노트 (채팅 AI)

사상가 페이지의 메인 탭 `개념 정리` 에 보이는 노트입니다. 사상가가 나온 기출 문항의 AI 분석을 모아 채팅 AI 에 맡기면, 사상의 논리적 순서(출발점 → 핵심 이론 → 실천 → 사회·정치 → 영향)대로 단원·개념을 재배열해 줍니다. API 키는 쓰지 않습니다.

1. 관리자 → `사상가 페이지 편집` → 사상가 선택 (또는 사상가 페이지의 `페이지 편집`)
2. `개념 정리 프롬프트 복사` → Claude / ChatGPT / Gemini 채팅에 붙여넣기 → 받은 답 전체를 붙여넣고 `검사하고 저장`
3. 필요하면 `② 개념 정리 노트 수정` 에서 단원·개념을 고치거나 순서를 바꾸고 저장 (JSON 직접 편집도 가능)

- 노트 맨 위에는 문장 없이 키워드·짧은 어구로만 된 `한눈에 보는 구조` 가 먼저 나오고, 그 아래에 단원별 본문이 이어집니다. 키워드를 누르면 해당 개념 본문으로 이동합니다. 구조도가 없는 예전 노트는 단원·개념에서 자동으로 만들어 보여 주며, 편집 화면의 `키워드 구조도` 에서 직접 고칠 수 있습니다.
- 노트의 기출 ref 는 실제 문항과 대조해 없는 것은 지웁니다. 링크를 누르면 해당 문항으로 갑니다.
- 노트를 만든 뒤 분석된 문항이 늘면 `이후 N문항이 더 분석됨` 이 표시됩니다. 다시 붙여넣으면 새 정리로 바뀝니다.
- 기존 자동 정리(기출 분석 모아보기) · 출제 패턴 · 관련 기출은 사상가 페이지의 다른 탭으로 볼 수 있습니다. 노트가 없으면 `기출 분석 모아보기` 탭이 먼저 보입니다.
- 기존 DB 는 Supabase SQL Editor 에서 `supabase/migrations/003_philosopher_notes.sql` 을 한 번 실행하세요. (여러 번 실행해도 안전)

점검 스크립트: `npm run test:notes`

### 비용 절감 설계

- 이미 분석된 문항은 자동으로 다시 분석하지 않습니다. (`분석 안 된 문항 모두 분석` 은 미분석 문항만)
- 문항 단위로 호출하고, 결과는 DB 에 저장(캐시)됩니다.
- 관리자 버튼으로 일부만 재분석: `전체 재분석` / `정답만` / `사상가만` / `원전만` / `해설만`
- 사상가 비교 결과는 `philosopher_comparisons` 에 저장되어 같은 비교는 다시 호출하지 않습니다.
- AI 호출 기록(토큰 수 포함)은 `analysis_runs` 테이블에서 볼 수 있습니다.
- 공개 AI 채점은 IP 당 시간당 20회로 제한됩니다. 친구들에게 비용이 걱정되면 `PUBLIC_AI_GRADING=false`.

## 10. 로컬 실행

```bash
npm run dev
```

브라우저에서 <http://localhost:3000> 을 엽니다. 관리자는 <http://localhost:3000/admin>.

그 밖의 명령:

```bash
npm run build        # 프로덕션 빌드 (배포 전 확인)
npm run start        # 빌드 결과 실행
npm run lint         # ESLint
npm run typecheck    # TypeScript 검사
npm run test:segment -- ./기출.pdf   # 문항 자동 분리 결과를 터미널에서 확인
```

## 11. 사용 순서

1. `/admin` → 비밀번호 입력
2. **PDF 업로드** → 파일 선택(또는 드래그) → 학년도·시험명·과목·전공 A/B·비고 확인 → `등록하고 문항 분리 시작`
   - 같은 PDF 라면 `이미 등록된 시험입니다.` 가 표시되고 기존 시험으로 이동할 수 있습니다.
   - 페이지 렌더링과 문항 분리는 브라우저에서 진행되므로 끝날 때까지 창을 닫지 마세요.
3. 시험 관리 화면에서 문항 목록을 확인합니다. 잘못 나뉜 문항은
   - `↓ 다음과 합치기`
   - 문항 수정 화면 → **문항 나누기** (자를 위치 슬라이더, 하위 문항 3-1/3-2 로 저장 가능)
   - 문항 수정 화면 → **영역 수정** 후 `영역 저장 + 문항 이미지 다시 만들기`
   - `문항 직접 추가`
4. `분석 안 된 문항 모두 분석` → 문항별로 AI 분석이 순서대로 실행됩니다.
5. `검토 필요` 문항을 열어 사상가·개념·원전·정답을 확인하고 필요하면 수정, 상태를 `검수 완료`로 바꿉니다.
6. **데이터 관리**에서 사상가 별칭(예: 왕수인 ← 왕양명), 개념 정의, 원전 원문·번역문을 정리합니다.
   원문을 넣어 두면 `원전만 재분석` 때 AI 가 그 원문과 대조합니다.
7. 친구들에게 사이트 URL 을 공유합니다. (관리자 페이지 비밀번호는 공유하지 마세요)

## 12. GitHub 업로드

이 프로젝트 폴더는 이미 git 저장소이며 첫 commit 이 되어 있습니다.

### 방법 A — GitHub CLI(gh) 사용

```bash
gh auth login                      # 처음 한 번
cd ethics-exam-study
gh repo create ethics-exam-study --private --source=. --remote=origin --push
```

### 방법 B — 웹에서 저장소 만들기

1. <https://github.com/new> → Repository name: `ethics-exam-study` → **Private** 권장 → README 등은 추가하지 말고 Create
2. 터미널에서

```bash
cd ethics-exam-study
git branch -M main
git remote add origin https://github.com/<내-아이디>/ethics-exam-study.git
git push -u origin main
```

> push 전에 `git status` 로 `.env.local` 이 목록에 없는지 확인하세요. (`.gitignore` 에 포함되어 있음)

## 13. Vercel 배포

1. <https://vercel.com> → GitHub 로 로그인 → **Add New… → Project** → `ethics-exam-study` Import
2. Framework 는 자동으로 **Next.js** 로 잡힙니다. Build Command / Output 은 기본값 그대로.
3. **Environment Variables** 에 `.env.local` 의 값을 하나씩 추가합니다.
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `AI_PROVIDER`, `AI_MODEL`, `ANTHROPIC_API_KEY` 등)
4. **Deploy**
5. 환경변수를 나중에 바꾸면 **Deployments → … → Redeploy** 해야 반영됩니다.
   특히 `NEXT_PUBLIC_*` 값은 빌드 시점에 들어가므로 반드시 재배포하세요.

참고

- AI 분석 API 는 최대 300초까지 실행되도록 설정되어 있습니다(`maxDuration`). Vercel Hobby 플랜의 Fluid Compute 기본값으로 동작합니다. 시간 초과가 나면 Vercel 프로젝트 **Settings → Functions** 에서 최대 실행 시간을 확인하세요.
- 사이트는 검색엔진 색인을 막도록(`robots: noindex`) 설정되어 있습니다.

## 14. 오류 해결법

| 증상 | 원인 / 해결 |
| --- | --- |
| 화면에 "Supabase 연결 설정이 필요합니다" | `.env.local` 의 Supabase 값 누락. 저장 후 `npm run dev` 재시작 |
| "relation ... does not exist" / 데이터를 불러오지 못함 | `supabase/schema.sql` 을 SQL Editor 에서 실행하지 않았음 |
| "Storage 업로드 URL 발급 실패" / "Bucket not found" | Storage 버킷 `exam-pdfs`, `question-images` 가 없음 → 6번 참고 |
| 관리자 로그인 시 "ADMIN_PASSWORD 환경변수가 설정되지 않았습니다" | `.env.local` 또는 Vercel 환경변수에 `ADMIN_PASSWORD` 추가 후 재시작/재배포 |
| 로그인했는데 계속 로그인 화면으로 돌아감 | 배포 환경이 https 가 아님(쿠키 Secure). Vercel 주소(https)로 접속 |
| AI 분석 시 "ANTHROPIC_API_KEY 가 설정되지 않았습니다" | 키 입력 후 재시작. `AI_PROVIDER` 철자 확인 |
| AI 분석 시 401 / 403 | API 키가 틀렸거나 결제 수단 미등록 |
| AI 분석 시 429 | 호출 한도 초과. 잠시 후 다시 시도 |
| AI 가 이미지를 못 읽음 | 버킷이 public 이 아님 → Storage 에서 public 으로 변경 |
| 문항 이미지가 안 바뀜 | 브라우저 캐시. 새로고침(Ctrl+Shift+R) |
| 문항 번호를 못 찾음 / 이상하게 나뉨 | 번호 형식이 특이한 PDF. 관리자 화면에서 합치기/나누기/직접 추가. `npm run test:segment -- 파일.pdf` 로 결과 확인 |
| 박스·말풍선 제시문 글이 텍스트에 빠짐 | 그 부분이 PDF 안에 **그림**으로 들어 있는 경우입니다. 문항 수정 화면의 `현재 영역 기준으로 텍스트 다시 추출`이 그림 부분만 자동으로 OCR(브라우저, 무료)해서 채웁니다. 전체를 OCR 로 읽으려면 `OCR 로 다시 읽기`. ㉠·○ 같은 기호는 OCR 이 틀릴 수 있으니 확인하세요 |
| 스캔 PDF | 텍스트가 없으므로 페이지 단위로 임시 문항이 생깁니다. 문항을 나눈 뒤 AI 분석 → AI 가 이미지에서 원문을 읽어 채웁니다 |
| `npm install` 후 PDF 미리보기 오류 (worker) | `node scripts/copy-pdf-worker.mjs` 를 직접 실행해 `public/pdfjs/` 생성 |
| Vercel 빌드 실패 | 로컬에서 `npm run build` 가 되는지 먼저 확인. Node 버전 20 이상인지 확인 |

---

## 15. 개발 메모

### 보안

- AI API Key, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD` 는 서버 코드(`server-only`)에서만 읽습니다. 브라우저 번들에 들어가는 값은 `NEXT_PUBLIC_*` 두 개뿐입니다.
- 모든 쓰기 API 는 `requireAdmin()` 으로 서버에서 세션을 다시 검증합니다. `src/proxy.ts` 는 화면 접근용 1차 확인입니다.
- DB 는 RLS 로 공개 읽기만 허용하고, 쓰기는 service role 로만 합니다.

### 확장 포인트

- **유사 기출 embedding**: `supabase/schema.sql` 의 `question_embeddings` 주석을 풀고, `src/lib/data/related.ts` 에 cosine 유사도 점수를 더하면 됩니다.
- **AI provider 추가**: `src/lib/ai/provider.ts` 의 `BaseProvider` 를 상속해 `generate()` 하나만 구현하면 됩니다.
- **프롬프트 수정**: `prompts/` 폴더만 고치면 됩니다.
- **스캔 PDF 자동 문항 분리**: 현재는 페이지 단위 임시 문항 → 관리자 분할. vision 모델로 문항 경계를 찾는 단계를 `processExamPdf()` 에 추가할 수 있습니다.
