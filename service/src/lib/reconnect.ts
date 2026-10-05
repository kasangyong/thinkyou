import "server-only";
import { rows, sql } from "./db";

export type Away = { days: number; afterDays: number };

// 재연결 약속을 한 청년 중, 약속한 기간보다 오래 소식이 없고 아직 돌아오지 않은 청년만 돌려준다.
// 마지막 활동 = 체크인, 청년이 보낸 글, 걸음 완료, 약속한 시각, 돌아올 문을 연 시각 중 가장 늦은 것.
export async function loadAway(youthIds: string[]): Promise<Map<string, Away>> {
  if (youthIds.length === 0) return new Map();
  const data = await rows<{ youth_id: string; after_days: number; days: number }>(sql`
    select youth_id, after_days, floor(extract(epoch from now() - last_seen) / 86400)::int as days
      from (
        select r.youth_id, r.after_days,
               greatest(
                 r.agreed_at,
                 r.returned_at,
                 (select max(c.created_at) from checkins c where c.youth_id = r.youth_id),
                 (select max(m.created_at) from messages m where m.youth_id = r.youth_id and m.sender_id = r.youth_id),
                 (select max(d.done_at) from daily_steps d where d.youth_id = r.youth_id)
               ) as last_seen
          from reconnect_promises r
         where r.youth_id = any(${youthIds}::uuid[])
      ) t
     where last_seen < now() - make_interval(days => after_days)`);
  return new Map(data.map((r) => [r.youth_id, { days: r.days, afterDays: r.after_days }]));
}
