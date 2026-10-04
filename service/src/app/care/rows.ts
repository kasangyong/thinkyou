import "server-only";
import { rows, sql } from "@/lib/db";
import type { YouthRow } from "@/ui/kit";

// 호출하는 쪽에서 이미 담당 관계로 걸러진 youthIds만 넘긴다.
export async function loadYouthRows(youthIds: string[], href?: (id: string) => string): Promise<YouthRow[]> {
  if (youthIds.length === 0) return [];
  const data = await rows<{ id: string; display_name: string; stage: number | null; proposed_stage: number | null; contacts14d: number }>(sql`
    select p.id, p.display_name, s.stage, s.proposed_stage,
           (select count(*)::int from contacts c
             where c.youth_id = p.id and c.occurred_at >= now() - interval '14 days') as contacts14d
      from profiles p left join stage_state s on s.youth_id = p.id
     where p.id = any(${youthIds}::uuid[])
     order by p.created_at`);
  return data.map((r) => ({
    id: r.id,
    name: r.display_name,
    stage: r.stage ?? 0,
    proposed: r.proposed_stage,
    contacts14d: r.contacts14d,
    href: href?.(r.id),
  }));
}
