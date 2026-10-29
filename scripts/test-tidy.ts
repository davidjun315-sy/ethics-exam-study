/** 문항 텍스트 다듬기 점검.  npm run test:tidy */
import { tidyQuestionText } from "../src/lib/text/tidy.ts";
import { checkQuizText, requirementLines } from "../src/lib/quiz/split.ts";

let failed = 0;
const check = (label: string, ok: boolean, d = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${label}${d ? ` — ${d}` : ""}`);
};

const pdf = `10. 다음은 서양 근대 윤리 사상가의 주장이다. <작성 방법>에
따라 서술하시오. [4점]
의무는 ‘자신에 대한 의무’와 ‘다른 사람에 대한 의무’,
‘완전한 의무’와 ‘불완전한 의무’로 통상적으로 분류된다.
(1) 나는 만약 생이 연장되는 기간에 쾌적함을 약속하기보다는
오히려 해악을 가져올 위험이 있다면, 차라리 생을 단축할 것이다.
(2) 만약 내가 돈이 없는 곤경에 처해 있다고 생각하면,
나는 돈을 빌리면서 갚겠다고 약속할 것이다.
의무의 보편적 명령은 “마치 너의 행위의 준칙이 보편적 ( ㉠ )이/가
되어야 하는 것처럼, 그렇게 행위하라.”는 것이다.
<작성 방법>
○ 괄호 안의 ㉠에 해당하는 용어를 쓸 것.
○ 준칙 (4)를 보편화하면 밑줄 친 ㉡이 생기는 이유를 ‘도움’을
사용하여 서술할 것.
○ 밑줄 친 ㉢, ㉣의 의미를 순서대로 서술할 것.`;
const t = tidyQuestionText(pdf);
const paras = t.split("\n\n");
check("발문 두 줄 → 한 줄", paras[0] === "10. 다음은 서양 근대 윤리 사상가의 주장이다. <작성 방법>에 따라 서술하시오. [4점]", paras[0]);
check("본문 문장 이어 붙이기", paras[1] === "의무는 ‘자신에 대한 의무’와 ‘다른 사람에 대한 의무’, ‘완전한 의무’와 ‘불완전한 의무’로 통상적으로 분류된다.");
check("(1)(2) 는 따로 단락", paras[2].startsWith("(1) 나는") && paras[2].endsWith("단축할 것이다.") && paras[3].startsWith("(2) 만약"));
check("<작성 방법> 머리글은 혼자", paras.includes("<작성 방법>"));
check("조건은 한 줄씩, 줄바꿈된 조건은 이어 붙임", paras.includes("○ 준칙 (4)를 보편화하면 밑줄 친 ㉡이 생기는 이유를 ‘도움’을 사용하여 서술할 것."));
check("퀴즈 조건 3개 그대로", requirementLines(t).length === 3);
check("글자는 그대로 (공백·줄바꿈 제외)", t.replace(/\s/g, "") === pdf.replace(/\s/g, ""));
check("두 번 다듬어도 같음", tidyQuestionText(t) === t);
const talk = tidyQuestionText("갑: 도덕은 이성에서\n나온다.\n을: 아니다. 감정에서\n나온다.\n교사: 좋아요.");
check("발화자는 줄 바꿈", talk === "갑: 도덕은 이성에서 나온다.\n\n을: 아니다. 감정에서 나온다.\n\n교사: 좋아요.", JSON.stringify(talk));
check("(가)(나) 제시문", tidyQuestionText("(가) 마음이\n곧 이치다.\n(나) 본성이\n곧 이치다.") === "(가) 마음이 곧 이치다.\n\n(나) 본성이 곧 이치다.");
check("빈 줄 여러 개 → 하나", tidyQuestionText("a\n\n\n\nb") === "a\n\nb");
const para = tidyQuestionText(`(3) 나는 재능을 개발하지 않고 향락적인 삶을 살고자 한다.
(4) 나는 어려운 처지에 있는 사람을 도우려고 하지 않을 것이다.
의무의 보편적 명령은 “마치 너의 행위의 준칙이 너의 의지에 의해 보편적 ( ㉠ )이/가 되어야
하는 것처럼, 그렇게 행위하라.”는 것이다. 그런데 몇몇 준칙의 경우에는 보편적 ( ㉠ )(으)로
생각하는 것조차 불가능하게 되는 모순이 생긴다. 다른 몇몇 준칙의 경우에는 그와 같은 ㉡내적
불가능성은 없지만 자기 자신과의 모순이 생긴다.`);
check("짧게 끝난 문장 줄 뒤는 새 단락 ((4) 와 다음 글 분리)", para.split("\n\n").length === 3 && para.split("\n\n")[2].startsWith("의무의 보편적") && para.endsWith("모순이 생긴다."), JSON.stringify(para.split("\n\n").map((x) => x.slice(0, 12))));
check("줄 끝에서 문장이 끝나도 줄이 꽉 차면 이어 붙임", para.split("\n\n")[2].includes("모순이 생긴다. 다른 몇몇") || para.split("\n\n")[2].includes("불가능하게 되는 모순이 생긴다. 다른"));
const c = checkQuizText(t, ["㉠", "㉡", "㉢", "㉣"]);
check("점검: 조건 3줄, 문제 3개, 빠진 레이블 없음", c.hasHeader && c.conditions === 3 && c.items === 3 && c.missing.length === 0, JSON.stringify(c));
const c2 = checkQuizText(t.replace("㉡이", "ㄴ이"), ["㉠", "㉡"]);
check("점검: 기호가 바뀌면 빠진 레이블로 표시", c2.missing.join() === "㉡");
if (failed) process.exit(1);
