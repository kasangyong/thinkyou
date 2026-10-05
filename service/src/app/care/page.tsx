import { redirect } from "next/navigation";
import { getMe } from "@/lib/auth";
import { rows, sql } from "@/lib/db";
import { kstTime } from "@/lib/format";
import { AlertItem, AppShell, Card, Label, YouthTable, type AlertView } from "@/ui/kit";
import { AutoRefresh } from "@/ui/auto-refresh";
import { SubmitButton } from "@/ui/submit-button";
import { ackAlert, logout, recomputeStages, resetDemo } from "../actions";
import { loadYouthRows } from "./rows";

const TITLE = { counselor: "담당 상담사", backup: "예비 담당자", crisis_team: "24시간 위기대응팀 (시뮬레이션)" } as const;

type AlertRow = {
  id: string;
  youth_id: string;
  level: AlertView["level"];
  acked_at: string | null;
  created_at: string;
  display_name: string;
  excerpt: string;
  severity: AlertView["severity"];
  handled_elsewhere: boolean;
};

export default async function CarePage() {
  const me = await getMe();
  if (!me || !(me.role in TITLE)) redirect("/");
  const role = me.role as keyof typeof TITLE;

  // 화면을 볼 때마다(10초 폴링) 확인되지 않은 알림을 다음 담당자에게 넘긴다
  await sql`select escalate_alerts()`;

  const alerts = await rows<AlertRow>(sql`
    select al.id, al.level, al.acked_at, al.created_at, al.youth_id, p.display_name, e.excerpt, e.severity,
           exists (select 1 from alerts x where x.crisis_event_id = al.crisis_event_id
                     and x.id <> al.id and x.acked_at is not null) as handled_elsewhere
      from alerts al
      join crisis_events e on e.id = al.crisis_event_id
      join profiles p on p.id = al.youth_id
     where al.recipient_id = ${me.id}
     order by al.created_at desc limit 30`);
  const views: AlertView[] = alerts.map((a) => ({
    id: a.id,
    level: a.level,
    youthName: a.display_name,
    excerpt: a.excerpt,
    severity: a.severity,
    createdAt: kstTime(a.created_at),
    acked: !!a.acked_at,
    handledElsewhere: a.handled_elsewhere,
    youthHref: `/care/${a.youth_id}`,
  }));

  let youths: Awaited<ReturnType<typeof loadYouthRows>> = [];
  let sent: { id: string; display_name: string; title: string; org: string; draft: string; sent_at: string }[] = [];
  if (role === "counselor") {
    const mine = await rows<{ youth_id: string }>(sql`select youth_id from assignments where counselor_id = ${me.id}`);
    youths = await loadYouthRows(mine.map((r) => r.youth_id), (id) => `/care/${id}`);
    // 청년이 직접 보낸 지원서. 기관 전달은 상담사가 맡는다
    sent = await rows(sql`
      select a.id, p.display_name, g.title, g.org, a.draft, a.sent_at
        from applications a
        join assignments s on s.youth_id = a.youth_id and s.counselor_id = ${me.id}
        join profiles p on p.id = a.youth_id
        join programs g on g.id = a.program_id
       where a.status = 'sent'
       order by a.sent_at desc limit 20`);
  }
  const open = views.filter((v) => !v.acked && !v.handledElsewhere).length;

  return (
    <AppShell
      title={TITLE[role]}
      subtitle={open ? `확인하지 않은 위기 알림 ${open}건` : "확인할 위기 알림이 없어요"}
      right={<form action={logout}><SubmitButton className="text-xs text-sub underline">로그아웃</SubmitButton></form>}
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
          {sent.length > 0 && (
            <>
              <Label>청년이 보낸 지원서</Label>
              <ul className="flex flex-col gap-2">
                {sent.map((a) => (
                  <li key={a.id}>
                    <details className="rounded-2xl border border-line bg-white p-4">
                      <summary className="cursor-pointer text-sm">
                        <span className="font-semibold text-ink">{a.display_name}</span> · {a.title}
                        <span className="block text-xs text-sub">{a.org} · {kstTime(a.sent_at)} 보냄 · 기관 전달 대기</span>
                      </summary>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">{a.draft}</p>
                    </details>
                  </li>
                ))}
              </ul>
            </>
          )}
          <Card>
            <Label>시연 도구 (내 세트만)</Label>
            <div className="mt-2 flex flex-col gap-2">
              <form action={recomputeStages}><SubmitButton className="w-full rounded-xl border border-line bg-white py-2 text-sm">단계 재계산</SubmitButton></form>
              <form action={resetDemo}><input type="hidden" name="mode" value="fresh" />
                <SubmitButton className="w-full rounded-xl border border-line bg-white py-2 text-sm">처음 상태 (1단계, 선배 첫 글)</SubmitButton></form>
              <form action={resetDemo}><input type="hidden" name="mode" value="four_weeks" />
                <SubmitButton className="w-full rounded-xl border border-line bg-white py-2 text-sm">4주 뒤 상태 (2단계, 2주간 꾸준히 주고받음)</SubmitButton></form>
              <form action={resetDemo}><input type="hidden" name="mode" value="away" />
                <SubmitButton className="w-full rounded-xl border border-line bg-white py-2 text-sm">3주 소식 없음 (2주 재연결 약속)</SubmitButton></form>
            </div>
          </Card>
        </>
      )}
    </AppShell>
  );
}
