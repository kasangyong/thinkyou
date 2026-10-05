import "server-only";
import { GoogleGenAI, type GenerateContentParameters } from "@google/genai";

export type Mood = "hard" | "ok" | "good";
export type StepSize = "normal" | "small";
export type Feedback = "easy" | "right" | "hard";

// 단계마다 걸음이 향하는 곳이 다르다: 방 안 → 선배 → 목소리·모임 → 밖
const STAGE_GOAL = [
  "방 안에서 몸과 공간을 조금 움직이는 걸음 (커튼, 물, 창문, 정리)",
  "방 안 걸음 + 회복 선배의 글을 읽어 보는 걸음",
  "회복 선배에게 짧은 글 한 줄을 보내는 걸음",
  "목소리나 2~3인 온라인 모임 쪽으로 반걸음 다가가는 걸음 (모임 시간 확인, 짧은 음성 연습)",
  "집 밖이나 기관 프로그램 쪽으로 가는 걸음 (현관, 편의점, 센터 위치 확인)",
];

// AI가 응답하지 않을 때 쓰는 기본 걸음(단계 × 크기)
const FALLBACK: [string, string][] = [
  ["커튼 열고 창밖 사진 한 장 찍기", "커튼을 한 뼘만 열어 보기"],
  ["선배의 글 하나를 끝까지 읽어 보기", "물 한 잔 마시고 창문 열어 보기"],
  ["선배에게 오늘 본 것 한 줄 보내기", "선배 글에 이모지 하나 남기기"],
  ["다음 온라인 모임 시간 확인해 보기", "선배에게 모임이 궁금하다고 한 줄 보내기"],
  ["집 앞 편의점까지 걸어갔다 오기", "현관문 밖에서 1분 서 있기"],
];

// 이미 작은 걸음인데 또 줄여 달라고 하면 단계와 상관없이 더 작은 것으로 내려간다
const TINY = ["물 한 모금 마셔 보기", "자리에서 기지개 한 번 켜기", "숨을 세 번 천천히 쉬어 보기"];

export function fallbackStep(stage: number, size: StepSize, current: string | null = null) {
  const row = FALLBACK[Math.min(Math.max(stage, 0), 4)];
  if (size === "normal") return row[0];
  // 지금 걸음보다 한 칸 아래로. 맨 아래에 닿으면 비슷한 크기의 다른 걸음으로 바꾼다
  const ladder = [row[1], ...TINY];
  const i = current ? ladder.indexOf(current) : -1;
  if (i < 0) return ladder[0];
  return i < ladder.length - 1 ? ladder[i + 1] : TINY[0];
}

const MOOD_KO: Record<Mood, string> = { hard: "힘듦", ok: "보통", good: "괜찮음" };
const FEEDBACK_KO: Record<Feedback, string> = { easy: "쉬웠다", right: "딱 좋았다", hard: "버거웠다" };

const SYSTEM = `너는 고립·은둔 청년의 회복 루틴 앱 '오늘한걸음'의 걸음 제안 도우미다.
- 오늘 할 아주 작은 행동 하나를 한국어 25자 이내로 제안한다.
- 5분 안에 끝나고, 실패해도 부담이 없어야 한다.
- 걸음의 방향은 '이번 단계의 방향'을 따른다. 단계가 오를수록 사람과 바깥 쪽으로 향한다.
- 컨디션이 힘들거나 어제 걸음이 버거웠다면 더 작게, 어제가 쉬웠다면 한 뼘만 크게 한다.
- 최근 걸음과 같은 행동은 피한다.
- 진단, 의학적 조언, 훈계, 감탄사를 쓰지 않는다. 행동만 쓴다.`;

// 실패하면 기본 문장으로 넘어가므로 화면에서는 티가 나지 않는다. 원인은 서버 로그로만 남긴다(키·입력 내용 제외)
function logFailure(where: string, e: unknown) {
  const status = (e as { status?: number }).status;
  console.warn(`[gemini] ${where} failed`, status ?? "", e instanceof Error ? e.message.slice(0, 200) : "");
}

let client: GoogleGenAI | null = null;
function ai() {
  if (!process.env.GEMINI_API_KEY) return null;
  // 한 번 기다리는 시간을 10초로 묶는다(Gemini가 허용하는 최소값). 늦으면 다음 모델이나 기본 문장으로 넘어간다
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { timeout: 10_000 } });
  return client;
}

// 모델이 붐비면(503·429 등) 다음 모델로 넘어간다. 지정한 모델 → 최신 flash → 최신 flash-lite 순
function models() {
  return [...new Set([process.env.GEMINI_MODEL, "gemini-flash-latest", "gemini-flash-lite-latest"].filter((m): m is string => !!m))];
}

async function generate(g: GoogleGenAI, params: Omit<GenerateContentParameters, "model">) {
  let last: unknown;
  for (const model of models()) {
    try {
      const res = await g.models.generateContent({ ...params, model });
      return { res, model };
    } catch (e) {
      last = e;
      const status = (e as { status?: number }).status;
      // 요청 자체가 잘못된 경우(400·401·403)는 다른 모델로 바꿔도 같으니 바로 멈춘다
      if (status && status >= 400 && status < 500 && status !== 404 && status !== 429) break;
    }
  }
  throw last;
}

// 실패하면 기본 걸음을 돌려준다. AI가 멈춰도 하루 루틴은 멈추지 않는다.
export async function suggestStep(input: {
  mood: Mood;
  size: StepSize;
  stage: number;
  recentSteps: string[];
  lastFeedback: Feedback | null;
  current: string | null;
}): Promise<string> {
  const fallback = fallbackStep(input.stage, input.size, input.current);
  const g = ai();
  if (!g) return fallback;
  const stage = Math.min(Math.max(input.stage, 0), 4);
  const prompt = [
    `컨디션: ${MOOD_KO[input.mood]}`,
    `현재 회복 단계: ${stage}`,
    `이번 단계의 방향: ${STAGE_GOAL[stage]}`,
    `어제 걸음에 대한 본인 평가: ${input.lastFeedback ? FEEDBACK_KO[input.lastFeedback] : "없음"}`,
    `최근 걸음: ${input.recentSteps.join(" / ") || "없음"}`,
    input.size === "small" && input.current
      ? `지금 걸음 "${input.current}"이 부담스럽다고 했다. 이것과 다른, 훨씬 작은 걸음을 제안해.`
      : input.size === "small" ? "오늘은 부담이 적은 아주 작은 걸음을 제안해." : "",
  ].join("\n");

  try {
    const { res } = await generate(g, {
      contents: prompt,
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          properties: { step: { type: "string" } },
          required: ["step"],
        },
      },
    });
    const step = (JSON.parse(res.text ?? "{}") as { step?: string }).step?.trim();
    return step && step.length <= 40 && step !== input.current ? step : fallback;
  } catch (e) {
    logFailure("suggestStep", e);
    return fallback;
  }
}

// ───────── 상시 대기실: 지원서 초안 ─────────
// 근거는 완료한 걸음과 접촉 횟수뿐이다. 대화 내용·위기 기록은 넘기지 않는다. 보낼지는 본인이 정한다.
const DRAFT_SYSTEM = `너는 고립·은둔 경험이 있는 청년이 프로그램에 지원할 때 쓸 지원서 초안을 돕는다.
- 청년 본인의 1인칭, 담백한 존댓말로 250~350자.
- 주어진 걸음 기록과 접촉 횟수만 근거로 쓴다. 없는 경험을 지어내지 않는다.
- 진단명, 병명, '은둔', '고립' 같은 낙인이 될 수 있는 단어를 쓰지 않는다. 본인이 직접 덧붙일 수 있게 둔다.
- 과장, 다짐, 감탄사 없이. 마지막 문장은 이 프로그램에서 해 보고 싶은 작은 일 하나.`;

export async function draftApplication(input: {
  program: { title: string; org: string; summary: string };
  doneSteps: string[];
  contacts4w: number;
}): Promise<string> {
  const steps = input.doneSteps.slice(0, 3);
  const fallback = [
    `${input.program.title}에 지원합니다.`,
    steps.length ? `최근에는 ${steps.join(", ")} 같은 작은 걸음을 하루에 하나씩 해 왔습니다.` : "최근 하루에 한 걸음씩 작은 일을 해 보고 있습니다.",
    input.contacts4w ? `지난 4주 동안 선배와 ${input.contacts4w}번 글을 주고받으며 사람과 이야기하는 일에 조금씩 익숙해지고 있습니다.` : "",
    "처음이라 서툴 수 있지만, 정해진 시간에 맞춰 참여해 보고 싶습니다.",
  ].filter(Boolean).join(" ");
  const g = ai();
  if (!g) return fallback;
  const prompt = [
    `프로그램: ${input.program.title} (${input.program.org})`,
    `프로그램 설명: ${input.program.summary}`,
    `최근 완료한 걸음: ${input.doneSteps.join(" / ") || "없음"}`,
    `지난 4주 선배와 주고받은 횟수: ${input.contacts4w}`,
  ].join("\n");
  try {
    const { res } = await generate(g, {
      contents: prompt,
      config: {
        systemInstruction: DRAFT_SYSTEM,
        responseMimeType: "application/json",
        responseJsonSchema: { type: "object", properties: { draft: { type: "string" } }, required: ["draft"] },
      },
    });
    const draft = (JSON.parse(res.text ?? "{}") as { draft?: string }).draft?.trim();
    return draft && draft.length >= 80 && draft.length <= 600 ? draft : fallback;
  } catch (e) {
    logFailure("draftApplication", e);
    return fallback;
  }
}

// 연결 점검: 운영에서 로그인 없이 Gemini가 실제로 응답하는지 확인한다. 호출 비용을 막으려고 10분간 결과를 재사용한다
type Health = { configured: boolean; ok: boolean; model?: string; ms?: number; status?: number };
let health: { at: number; result: Health } | null = null;
export async function geminiHealth() {
  if (health && Date.now() - health.at < 10 * 60_000) return { ...health.result, cached: true };
  const g = ai();
  let result: Health = { configured: !!g, ok: false };
  if (g) {
    const t = Date.now();
    try {
      const { res, model } = await generate(g, { contents: "ok 라고만 답해" });
      result = { ...result, ok: !!res.text?.trim(), model, ms: Date.now() - t };
    } catch (e) {
      logFailure("health", e);
      result = { ...result, ms: Date.now() - t, status: (e as { status?: number }).status };
    }
  }
  health = { at: Date.now(), result };
  return { ...result, cached: false };
}

// ───────── AI와 이야기하기 ─────────
// 붙잡지 않는 대화: 짧게 받아 주고, 단계가 오를수록 선배 쪽으로 돌려보낸다
const CHAT_SYSTEM = `너는 고립·은둔 청년의 회복 앱 '오늘한걸음'의 AI다. 너의 목표는 대화를 오래 끄는 것이 아니라 청년이 사람(회복 선배)에게 돌아가게 돕는 것이다.
- 한국어 존댓말, 2문장 이내, 80자 안팎.
- 첫 문장은 들은 내용을 짧게 받아 주기. 두 번째 문장은 아주 작은 질문이나 5분짜리 걸음 하나.
- 진단, 병명, 의학적 조언, 훈계, 과한 감탄을 쓰지 않는다. 네가 친구나 사람을 대신한다고 말하지 않는다.
- 위험해 보이는 말이 있으면 109(24시간 자살예방상담)를 안내한다.`;

const CHAT_FALLBACK = [
  "이야기해 줘서 고마워요. 오늘 커튼을 한 뼘만 열어 볼래요?",
  "그랬군요. 지금 물 한 잔 마시고 다시 와도 괜찮아요.",
  "천천히 해도 돼요. 오늘 한 걸음은 이미 충분히 작아요.",
];

export async function aiReply(input: {
  history: { role: "youth" | "ai"; body: string }[];
  stage: number;
  mentorName: string;
  remaining: number;
}): Promise<string> {
  const fallback = input.remaining <= 0
    ? `오늘 이야기는 여기까지 할게요. ${input.mentorName} 님에게 한 줄 남겨 볼래요?`
    : CHAT_FALLBACK[input.history.length % CHAT_FALLBACK.length];
  const g = ai();
  if (!g) return fallback;
  const guide = [
    `현재 회복 단계: ${input.stage} (0~4, 높을수록 사람과 바깥으로)`,
    input.stage >= 1 ? `담당 회복 선배 이름: ${input.mentorName}. 자연스러우면 이 이야기를 선배에게도 한 줄 해 보자고 권한다.` : "",
    input.remaining <= 0 ? `오늘 AI와 나눌 대화는 이번이 마지막이다. 따뜻하게 마무리하고 ${input.mentorName} 님에게 한 줄 남겨 보라고 권한다.` : `오늘 남은 대화 횟수: ${input.remaining}`,
  ].filter(Boolean).join("\n");
  // 잘라 온 기록이 AI 답으로 시작하면 버린다(대화는 사용자 차례로 시작해야 한다)
  const firstYouth = input.history.findIndex((m) => m.role === "youth");
  const history = firstYouth < 0 ? [] : input.history.slice(firstYouth);
  if (history.length === 0) return fallback;
  try {
    const { res } = await generate(g, {
      contents: history.map((m) => ({ role: m.role === "youth" ? "user" : "model", parts: [{ text: m.body }] })),
      config: { systemInstruction: `${CHAT_SYSTEM}\n${guide}` },
    });
    const text = res.text?.trim();
    return text && text.length <= 200 ? text : fallback;
  } catch (e) {
    logFailure("aiReply", e);
    return fallback;
  }
}
