// 위기 표현 1차 감지(규칙 기반). LLM 장애와 무관하게 메시지를 보내는 즉시 동작해야 한다.
// 놓치는 것보다 과하게 잡는 쪽을 택한다. 잡히면 109 안내를 띄우고 사람에게 알린다.

export type Severity = "high" | "urgent";

const URGENT = [
  /죽고\s*싶/, /죽을\s*거/, /죽어\s*버리/, /죽었으면/, /자살/, /목숨을?\s*끊/, /뛰어내리/, /유서/,
  /끝내고\s*싶/, /살기\s*싫/, /살고\s*싶지\s*않/,
  /사라지고\s*싶/, /사라져\s*(버리고\s*)?싶/, /없어지고\s*싶/, /없어져\s*(버리고\s*)?싶/,
];

const HIGH = [
  /다\s*그만두고\s*싶/, /그만\s*하고\s*싶/, /그만\s*살/, /버티기\s*힘들/, /살\s*이유/, /살아야\s*할\s*이유/,
  /의미(가|도)?\s*없/, /자해/, /손목/, /약을?\s*(다|많이)\s*먹/, /아무도\s*없/, /혼자\s*죽/, /짐이\s*되/,
];

export function detectCrisis(text: string): Severity | null {
  const t = text.replace(/\s+/g, " ");
  if (URGENT.some((r) => r.test(t))) return "urgent";
  if (HIGH.some((r) => r.test(t))) return "high";
  return null;
}
