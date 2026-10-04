import "server-only";
import { GoogleGenAI } from "@google/genai";

export type Mood = "hard" | "ok" | "good";
export type StepSize = "normal" | "small";

const FALLBACK: Record<StepSize, string> = {
  normal: "커튼 열고 창밖 사진 한 장 찍기",
  small: "커튼을 한 뼘만 열어 보기",
};

const MOOD_KO: Record<Mood, string> = { hard: "힘듦", ok: "보통", good: "괜찮음" };

const SYSTEM = `너는 고립·은둔 청년의 회복 루틴 앱 '오늘한걸음'의 걸음 제안 도우미다.
- 오늘 할 아주 작은 행동 하나를 한국어 25자 이내로 제안한다.
- 방 안에서 할 수 있고, 5분 안에 끝나고, 실패해도 부담이 없어야 한다.
- 컨디션이 힘들면 더 작게, 괜찮으면 조금 바깥이나 사람 쪽으로 향하게 한다.
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
}): Promise<string> {
  const g = ai();
  if (!g) return FALLBACK[input.size];
  const prompt = [
    `컨디션: ${MOOD_KO[input.mood]}`,
    `현재 회복 단계: ${input.stage} (0~1: 선배 글 읽기, 2: 선배와 짧은 글 주고받기, 3: 음성·소모임, 4: 오프라인)`,
    `최근 걸음: ${input.recentSteps.join(" / ") || "없음"}`,
    input.size === "small" ? "직전 걸음이 부담스러웠다. 그보다 훨씬 작은 걸음을 제안해." : "",
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
    return step && step.length <= 40 ? step : FALLBACK[input.size];
  } catch {
    return FALLBACK[input.size];
  }
}
