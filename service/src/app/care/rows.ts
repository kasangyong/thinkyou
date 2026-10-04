import "server-only";
import { createClient } from "@/lib/supabase/server";
import { daysAgoIso } from "@/lib/format";
import type { YouthRow } from "@/ui/kit";

export async function loadYouthRows(youthIds: string[], href?: (id: string) => string): Promise<YouthRow[]> {
  if (youthIds.length === 0) return [];
  const supabase = await createClient();
  const since = daysAgoIso(14);
  const [{ data: profiles }, { data: stages }, { data: contacts }] = await Promise.all([
    supabase.from("profiles").select("id, display_name").in("id", youthIds),
    supabase.from("stage_state").select("youth_id, stage, proposed_stage").in("youth_id", youthIds),
    supabase.from("contacts").select("youth_id").in("youth_id", youthIds).gte("occurred_at", since),
  ]);
  return youthIds.map((id) => {
    const st = stages?.find((s) => s.youth_id === id);
    return {
      id,
      name: profiles?.find((p) => p.id === id)?.display_name ?? "청년",
      stage: st?.stage ?? 0,
      proposed: st?.proposed_stage ?? null,
      contacts14d: contacts?.filter((c) => c.youth_id === id).length ?? 0,
      href: href?.(id),
    };
  });
}
