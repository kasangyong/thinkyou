import "server-only";
import { one, sql } from "./db";
import { kstDay } from "./format";

// 물러나는 AI: 단계가 오를수록 하루에 AI에게 보낼 수 있는 말이 줄어든다
export const AI_DAILY = [10, 6, 4, 2, 1];

export function aiLimit(stage: number) {
  return AI_DAILY[Math.min(Math.max(stage, 0), 4)];
}

// 오늘(KST) 청년이 AI에게 보낸 말 수. 위기로 감지된 글은 세지 않는다
export async function aiUsedToday(youthId: string) {
  const start = new Date(`${kstDay()}T00:00:00+09:00`).toISOString();
  const r = await one<{ n: number }>(sql`
    select count(*)::int as n from ai_messages
     where youth_id = ${youthId} and role = 'youth' and not crisis and created_at >= ${start}::timestamptz`);
  return r?.n ?? 0;
}
