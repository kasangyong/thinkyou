import { redirect } from "next/navigation";
import { getMe } from "@/lib/auth";
import { one, rows, sql } from "@/lib/db";
import { kstDay, splitWeeks } from "@/lib/format";
import { AiLink, AppShell, Card, ContactWeeks, DoorCard, Label, MoodPicker, NavLink, PromiseCard, RoomLink, StageLadder, StageProposal, StepCard, type MoodValue, type StepFeedback } from "@/ui/kit";
import { SubmitButton } from "@/ui/submit-button";
import { checkIn, comeBack, completeStep, dropPromise, logout, respondStage, setPromise, smallerStep, stepFeedback } from "../actions";
import { loadAway } from "@/lib/reconnect";
import { aiLimit, aiUsedToday } from "@/lib/ai-chat";
import { ensureMigrations } from "@/lib/migrate";

export default async function YouthHome() {
  const me = await getMe();
  if (!me || me.role !== "youth") redirect("/");
  // 접속할 때마다 단계 제안 조건을 확인한다(2주 연속 주 3회 → 다음 단계 제안)
  await sql`select compute_stage_proposal(${me.id})`;

  await ensureMigrations();
  const today = kstDay();
  const [checkin, step, stage, contacts, reaction, target, mentor, week] = await Promise.all([
    one<{ mood: string }>(sql`select mood from checkins where youth_id = ${me.id} and day = ${today}`),
    one<{ text: string; done_at: string | null; feedback: StepFeedback | null }>(
      sql`select text, done_at, feedback from daily_steps where youth_id = ${me.id} and day = ${today}`),
    one<{ stage: number; proposed_stage: number | null }>(sql`select stage, proposed_stage from stage_state where youth_id = ${me.id}`),
    rows<{ occurred_at: string }>(sql`select occurred_at from contacts where youth_id = ${me.id} and occurred_at >= now() - interval '14 days'`),
    one<{ n: number }>(sql`select count(*)::int as n from reactions where youth_id = ${me.id} and created_at >= now() - interval '14 days'`),
    one<{ value: number }>(sql`select value from app_config where key = 'weekly_contact_target'`),
    one<{ display_name: string }>(sql`
      select p.display_name from assignments a join profiles p on p.id = a.mentor_id where a.youth_id = ${me.id}`),
    one<{ n: number }>(sql`
      select count(*)::int as n from daily_steps
       where youth_id = ${me.id} and done_at is not null and day > ${today}::date - 7`),
  ]);
  const mentorName = mentor?.display_name ?? "선배";

  // 상시 대기실·재연결 약속
  const myStage = stage?.stage ?? 0;
  const aiMax = aiLimit(myStage);
  const [promise, away, counselor, fit, aiUsed] = await Promise.all([
    one<{ after_days: number }>(sql`select after_days from reconnect_promises where youth_id = ${me.id}`),
    loadAway([me.id]).then((m) => m.get(me.id)),
    one<{ display_name: string }>(sql`
      select p.display_name from assignments a join profiles p on p.id = a.counselor_id where a.youth_id = ${me.id}`),
    rows<{ title: string; until: string }>(sql`
      select title, to_char(recruit_until, 'FMMM. FMDD.') as until from programs
       where recruit_until >= current_date and min_stage <= ${myStage} + 1
       order by recruit_until`),
    aiUsedToday(me.id),
  ]);
  const weeks = splitWeeks(contacts.map((c) => new Date(c.occurred_at).toISOString()));
  const reactionCount = reaction?.n ?? 0;

  return (
    <AppShell
      title={`${me.display_name} 님, 오늘도 와 줬네요`}
      subtitle="오늘의 한 걸음만 하면 충분해요"
      right={<form action={logout}><SubmitButton className="text-xs text-sub underline">로그아웃</SubmitButton></form>}
    >
      {away && (
        <DoorCard
          days={away.days}
          mentorName={mentor?.display_name ?? null}
          counselorName={counselor?.display_name ?? null}
          nextProgram={fit[0] ?? null}
          stage={myStage}
          action={comeBack}
        />
      )}

      {!checkin ? (
        <Card tone="ai">
          <p className="mb-3 text-sm text-ink">지금 기분은 어느 쪽에 가까워요?</p>
          <MoodPicker action={checkIn} />
        </Card>
      ) : step ? (
        <StepCard
          text={step.text}
          done={!!step.done_at}
          doneAction={completeStep}
          smallerAction={smallerStep}
          feedback={step.feedback}
          feedbackAction={stepFeedback}
          mentorName={mentorName}
          weekDone={week?.n ?? 0}
          shareHref={`/youth/chat?draft=${encodeURIComponent(`오늘 한 걸음: ${step.text}. 해 봤어요`)}`}
        />
      ) : (
        <Card><p className="text-sm">오늘의 걸음을 준비하고 있어요.</p><MoodPicker action={checkIn} selected={checkin.mood as MoodValue} /></Card>
      )}

      {stage?.proposed_stage != null && <StageProposal proposed={stage.proposed_stage} action={respondStage} />}

      <NavLink href="/youth/chat">선배와 주고받기</NavLink>
      <AiLink remaining={Math.max(aiMax - aiUsed, 0)} limit={aiMax} />
      <RoomLink fitCount={fit.length} />

      <ContactWeeks lastWeek={weeks.lastWeek} thisWeek={weeks.thisWeek} target={target?.value ?? 3} reactions={reactionCount ?? 0} />

      <Card>
        <Label>나의 걸음</Label>
        <div className="mt-2"><StageLadder stage={stage?.stage ?? 0} /></div>
      </Card>

      <PromiseCard afterDays={promise?.after_days ?? null} mentorName={mentorName} setAction={setPromise} dropAction={dropPromise} />
    </AppShell>
  );
}
