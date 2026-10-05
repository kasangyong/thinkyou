import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getMe } from "@/lib/auth";
import { one, rows, sql } from "@/lib/db";
import { kstDay, kstTime, splitWeeks } from "@/lib/format";
import { ensureMigrations } from "@/lib/migrate";
import { loadAway } from "@/lib/reconnect";
import { AppShell, Card, Label } from "@/ui/kit";

const MOOD_KO: Record<string, string> = { hard: "힘듦", ok: "보통", good: "괜찮음" };
const FEEDBACK_KO: Record<string, string> = { easy: "쉬웠어요", right: "딱 좋았어요", hard: "버거웠어요" };
const STAGE_KO = ["AI와 이야기하기", "선배의 글 읽기", "선배와 글 주고받기", "음성 · 2~3인 온라인 모임", "밖에서 만나기 · 기관 프로그램"];

type Day = { day: string; mood: string | null; text: string | null; done: boolean; feedback: string | null };

// 상담사가 위기 알림을 받은 뒤 맥락을 보는 화면.
// 선배와의 대화·AI 대화 내용은 보여 주지 않는다(위기로 감지된 글의 발췌만). 그 청년에게 배정된 상담사·예비 담당·위기대응팀만 볼 수 있다.
export default async function YouthRecord({ params }: PageProps<"/care/[youthId]">) {
  const me = await getMe();
  if (!me || !["counselor", "backup", "crisis_team"].includes(me.role)) redirect("/");
  const { youthId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(youthId)) notFound();
  const allowed = await one(sql`
    select 1 from assignments
     where youth_id = ${youthId} and ${me.id}::uuid in (counselor_id, backup_id, crisis_team_id)`);
  if (!allowed) notFound();
  await ensureMigrations();

  const [youth, stage, days, contacts, aiWeek, promise, away, apps, crises] = await Promise.all([
    one<{ display_name: string }>(sql`select display_name from profiles where id = ${youthId}`),
    one<{ stage: number; proposed_stage: number | null }>(sql`select stage, proposed_stage from stage_state where youth_id = ${youthId}`),
    rows<Day>(sql`
      select to_char(d.day, 'FMMM. FMDD.') as day, c.mood, s.text, s.done_at is not null as done, s.feedback
        from generate_series(${kstDay()}::date - 13, ${kstDay()}::date, interval '1 day') as d(day)
        left join checkins c on c.youth_id = ${youthId} and c.day = d.day::date
        left join daily_steps s on s.youth_id = ${youthId} and s.day = d.day::date
       where c.mood is not null or s.text is not null
       order by d.day desc`),
    rows<{ occurred_at: string }>(sql`
      select occurred_at from contacts where youth_id = ${youthId} and occurred_at >= now() - interval '14 days'`),
    one<{ n: number }>(sql`
      select count(*)::int as n from ai_messages where youth_id = ${youthId} and role = 'youth' and not crisis and created_at >= now() - interval '7 days'`),
    one<{ after_days: number }>(sql`select after_days from reconnect_promises where youth_id = ${youthId}`),
    loadAway([youthId]).then((m) => m.get(youthId)),
    // 보내기 전 초안은 본인만 본다
    rows<{ title: string; sent_at: string }>(sql`
      select g.title, a.sent_at from applications a join programs g on g.id = a.program_id
       where a.youth_id = ${youthId} and a.status = 'sent' order by a.sent_at desc`),
    rows<{ id: string; severity: string; excerpt: string; created_at: string; acked: boolean }>(sql`
      select e.id, e.severity, e.excerpt, e.created_at,
             exists (select 1 from alerts al where al.crisis_event_id = e.id and al.acked_at is not null) as acked
        from crisis_events e where e.youth_id = ${youthId} and e.created_at >= now() - interval '30 days'
       order by e.created_at desc limit 10`),
  ]);
  const weeks = splitWeeks(contacts.map((c) => new Date(c.occurred_at).toISOString()));
  const s = stage?.stage ?? 0;

  return (
    <AppShell
      title={`${youth?.display_name ?? "청년"} 님 기록`}
      subtitle={`${s}단계 · ${STAGE_KO[s]}${stage?.proposed_stage != null ? ` → ${stage.proposed_stage}단계 제안 중` : ""}`}
      right={<Link href="/care" className="text-xs text-sub underline">목록</Link>}
    >
      <p className="rounded-xl bg-white px-3 py-2 text-xs text-sub ring-1 ring-line">
        선배·AI와 나눈 대화 내용은 보이지 않아요. 위험 신호로 감지된 글만 아래에 발췌돼요.
      </p>

      {crises.length > 0 && (
        <Card tone="person">
          <Label>최근 30일 위기 신호 {crises.length}건</Label>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {crises.map((c) => (
              <li key={c.id} className="rounded-xl bg-white/70 px-3 py-2">
                <span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-semibold ${c.severity === "urgent" ? "bg-alert text-white" : "bg-alert-soft text-alert"}`}>
                  {c.severity === "urgent" ? "긴급" : "주의"}
                </span>
                <span className="text-xs text-sub">{kstTime(c.created_at)} · {c.acked ? "확인됨" : "확인 전"}</span>
                <span className="mt-1 block text-ink">“{c.excerpt}”</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <Label>사람과의 연결</Label>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-paper px-3 py-2"><dt className="text-xs text-sub">양방향 접촉 · 이번 주</dt><dd className="font-semibold text-ink">{weeks.thisWeek}회</dd></div>
          <div className="rounded-xl bg-paper px-3 py-2"><dt className="text-xs text-sub">양방향 접촉 · 지난주</dt><dd className="font-semibold text-ink">{weeks.lastWeek}회</dd></div>
          <div className="rounded-xl bg-paper px-3 py-2"><dt className="text-xs text-sub">AI에게 보낸 말 · 7일</dt><dd className="font-semibold text-ink">{aiWeek?.n ?? 0}번</dd></div>
          <div className="rounded-xl bg-paper px-3 py-2">
            <dt className="text-xs text-sub">재연결 약속</dt>
            <dd className="font-semibold text-ink">
              {promise ? (promise.after_days === 14 ? "2주" : "한 달") : "안 함"}
              {away && <span className="block text-xs font-normal text-alert">{away.days}일째 소식 없음</span>}
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <Label>최근 2주 기분과 걸음</Label>
        {days.length === 0 ? (
          <p className="mt-2 text-sm text-sub">아직 기록이 없어요.</p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-line text-sm">
            {days.map((d) => (
              <li key={d.day} className="flex gap-3 py-2">
                <span className="w-12 shrink-0 text-xs text-sub">{d.day}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-ink">{d.text ?? "걸음 없음"}</span>
                  <span className="text-xs text-sub">
                    기분 {d.mood ? MOOD_KO[d.mood] : "-"} · {d.done ? "했어요" : "안 함"}
                    {d.feedback ? ` · ${FEEDBACK_KO[d.feedback]}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <Label>보낸 지원서</Label>
        {apps.length === 0 ? (
          <p className="mt-2 text-sm text-sub">아직 없어요.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {apps.map((a) => (
              <li key={a.title} className="text-ink">
                {a.title} · <span className="text-sub">{kstTime(a.sent_at)} 보냄</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}
