import "server-only";
import { GoogleGenAI } from "@google/genai";

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

export function fallbackStep(stage: number, size: StepSize) {
  const row = FALLBACK[Math.min(Math.max(stage, 0), 4)];
  return size === "small" ? row[1] : row[0];
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

let client: GoogleGenAI | null = null;
function ai() {
  if (!process.env.GEMINI_API_KEY) return null;
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

// 실패하면 기본 걸음을 돌려준다. AI가 멈춰도 하루 루틴은 멈추지 않는다.
export async function suggestStep(input: {
  mood: Mood;
  size: StepSize;
  stage: number;
  recentSteps: string[];
  lastFeedback: Feedback | null;
}): Promise<string> {
  const fallback = fallbackStep(input.stage, input.size);
  const g = ai();
  if (!g) return fallback;
  const stage = Math.min(Math.max(input.stage, 0), 4);
  const prompt = [
    `컨디션: ${MOOD_KO[input.mood]}`,
    `현재 회복 단계: ${stage}`,
    `이번 단계의 방향: ${STAGE_GOAL[stage]}`,
    `어제 걸음에 대한 본인 평가: ${input.lastFeedback ? FEEDBACK_KO[input.lastFeedback] : "없음"}`,
    `최근 걸음: ${input.recentSteps.join(" / ") || "없음"}`,
    input.size === "small" ? "지금 걸음이 부담스럽다고 했다. 그보다 훨씬 작은 걸음을 제안해." : "",
  ].join("\n");

  try {
    const res = await g.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-flash-latest",
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
    return step && step.length <= 40 ? step : fallback;
  } catch {
    return fallback;
  }
}
