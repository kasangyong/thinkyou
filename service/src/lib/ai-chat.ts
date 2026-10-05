import "server-only";
import { one, sql } from "./db";

// 물러나는 AI: 대화를 막지 않는다. 대신 이번 주 내가 말을 건 곳이 사람인지 AI인지 보여 주고,
// 단계가 오를수록 AI 답은 짧아지며 선배 쪽으로 이어 준다(gemini.ts aiReply).
// 사람 = 내가 선배에게 보낸 글, AI = 내가 AI에게 보낸 말. 지난 7일. 사람 쪽은 이모지를 빼고, 양쪽 모두 위기 글은 뺀다.
export async function weeklyTalk(youthId: string) {
  const r = await one<{ person: number; ai: number }>(sql`
    select
      (select count(*)::int from messages
        where youth_id = ${youthId} and sender_id = ${youthId} and kind = 'text'
          and created_at >= now() - interval '7 days'
          and not exists (select 1 from crisis_events e where e.message_id = messages.id)) as person,
      (select count(*)::int from ai_messages
        where youth_id = ${youthId} and role = 'youth' and not crisis
          and created_at >= now() - interval '7 days') as ai`);
  return { person: r?.person ?? 0, ai: r?.ai ?? 0 };
}
