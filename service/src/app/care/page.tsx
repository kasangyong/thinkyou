import { redirect } from "next/navigation";
import { createClient, getMe } from "@/lib/supabase/server";
import { kstTime } from "@/lib/format";
import { AlertItem, AppShell, Card, Label, YouthTable, type AlertView } from "@/ui/kit";
import { AutoRefresh } from "@/ui/auto-refresh";
import { ackAlert, logout, recomputeStages, resetDemo } from "../actions";
import { loadYouthRows } from "./rows";

const TITLE = { counselor: "담당 상담사", backup: "예비 담당자", crisis_team: "24시간 위기대응팀 (시뮬레이션)" } as const;

export default async function CarePage() {
  const me = await getMe();
  if (!me || !(me.role in TITLE)) redirect("/");
  const role = me.role as keyof typeof TITLE;
  const supabase = await createClient();

  // pg_cron이 없을 때를 대비해, 화면을 볼 때마다 재전달 조건도 확인한다
  await supabase.rpc("escalate_alerts");

  const { data: alerts } = await supabase
    .from("alerts")
    .select("id, level, acked_at, created_at, youth_id, crisis_event_id")
    .eq("recipient_id", me.id)
    .order("created_at", { ascending: false })
    .limit(30);
  const eventIds = [...new Set((alerts ?? []).map((a) => a.crisis_event_id))];
  const youthIds = [...new Set((alerts ?? []).map((a) => a.youth_id))];
  const [{ data: events }, { data: names }] = await Promise.all([
    eventIds.length ? supabase.from("crisis_events").select("id, excerpt, severity").in("id", eventIds) : Promise.resolve({ data: [] }),
    youthIds.length ? supabase.from("profiles").select("id, display_name").in("id", youthIds) : Promise.resolve({ data: [] }),
  ]);
  const views: AlertView[] = (alerts ?? []).map((a) => {
    const ev = events?.find((e) => e.id === a.crisis_event_id);
    return {
      id: a.id,
      level: a.level,
      youthName: names?.find((n) => n.id === a.youth_id)?.display_name ?? "청년",
      excerpt: ev?.excerpt ?? "",
      severity: ev?.severity ?? "high",
      createdAt: kstTime(a.created_at),
      acked: !!a.acked_at,
    };
  });

  let youths: Awaited<ReturnType<typeof loadYouthRows>> = [];
  if (role === "counselor") {
    const { data: rows } = await supabase.from("assignments").select("youth_id").eq("counselor_id", me.id);
    youths = await loadYouthRows((rows ?? []).map((r) => r.youth_id));
  }
  const open = views.filter((v) => !v.acked).length;

  return (
    <AppShell
      title={TITLE[role]}
      subtitle={open ? `확인하지 않은 위기 알림 ${open}건` : "확인할 위기 알림이 없어요"}
      right={<form action={logout}><button className="text-xs text-sub underline">로그아웃</button></form>}
    >
      <AutoRefresh seconds={10} />
      {views.length === 0 ? (
        <Card><p className="text-sm text-sub">아직 받은 알림이 없어요. 알림은 사람이 확인할 때까지 다음 담당자에게 넘어갑니다.</p></Card>
      ) : (
        views.map((v) => <AlertItem key={v.id} alert={v} ackAction={ackAlert} />)
      )}

      {role === "counselor" && (
        <>
          <Label>담당 청년</Label>
          <YouthTable rows={youths} />
          <Card>
            <Label>시연 도구 (내 세트만)</Label>
            <div className="mt-2 flex flex-col gap-2">
              <form action={recomputeStages}><button className="w-full rounded-xl border border-line bg-white py-2 text-sm">단계 재계산</button></form>
              <form action={resetDemo}><input type="hidden" name="mode" value="fresh" />
                <button className="w-full rounded-xl border border-line bg-white py-2 text-sm">처음 상태 (1단계, 선배 첫 글)</button></form>
              <form action={resetDemo}><input type="hidden" name="mode" value="four_weeks" />
                <button className="w-full rounded-xl border border-line bg-white py-2 text-sm">4주 뒤 상태 (2단계, 2주간 주 3회)</button></form>
            </div>
          </Card>
        </>
      )}
    </AppShell>
  );
}
