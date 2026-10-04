import { redirect } from "next/navigation";
import { createClient, getMe } from "@/lib/supabase/server";
import { AppShell, Card, Label, YouthTable } from "@/ui/kit";
import { AutoRefresh } from "@/ui/auto-refresh";
import { logout, resetDemo } from "../actions";
import { loadYouthRows } from "../care/rows";

export default async function MentorHome() {
  const me = await getMe();
  if (!me || me.role !== "mentor") redirect("/");
  const supabase = await createClient();
  const { data: rows } = await supabase.from("assignments").select("youth_id").eq("mentor_id", me.id);
  const youths = await loadYouthRows((rows ?? []).map((r) => r.youth_id), (id) => `/mentor/${id}`);

  return (
    <AppShell
      title={`회복 선배 ${me.display_name}`}
      subtitle="짧은 글로 천천히 이어 주세요. 답장은 48시간 안이면 충분해요"
      right={<form action={logout}><button className="text-xs text-sub underline">로그아웃</button></form>}
    >
      <AutoRefresh seconds={15} />
      <YouthTable rows={youths} />
      <Card>
        <Label>시연 도구 (내 세트만)</Label>
        <form action={resetDemo} className="mt-2"><input type="hidden" name="mode" value="fresh" />
          <button className="w-full rounded-xl border border-line bg-white py-2 text-sm">처음 상태로 되돌리기</button>
        </form>
      </Card>
    </AppShell>
  );
}
