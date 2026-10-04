import { redirect } from "next/navigation";
import { createClient, getMe } from "@/lib/supabase/server";
import { daysAgoIso, kstDay, splitWeeks } from "@/lib/format";
import { AppShell, Card, ContactWeeks, Label, MoodPicker, NavLink, StageLadder, StageProposal, StepCard, type MoodValue } from "@/ui/kit";
import { checkIn, completeStep, logout, respondStage, smallerStep } from "../actions";

export default async function YouthHome() {
  const me = await getMe();
  if (!me || me.role !== "youth") redirect("/");
  const supabase = await createClient();

  // 접속할 때마다 단계 제안 조건을 확인한다(2주 연속 주 3회 → 다음 단계 제안)
  await supabase.rpc("compute_stage_proposal", { p_youth: me.id });

  const since = daysAgoIso(14);
  const [{ data: checkin }, { data: step }, { data: stage }, { data: contacts }, { count: reactionCount }, { data: target }] =
    await Promise.all([
      supabase.from("checkins").select("mood").eq("youth_id", me.id).eq("day", kstDay()).maybeSingle(),
      supabase.from("daily_steps").select("text, done_at").eq("youth_id", me.id).eq("day", kstDay()).maybeSingle(),
      supabase.from("stage_state").select("stage, proposed_stage").eq("youth_id", me.id).maybeSingle(),
      supabase.from("contacts").select("occurred_at").eq("youth_id", me.id).gte("occurred_at", since),
      supabase.from("reactions").select("id", { count: "exact", head: true }).eq("youth_id", me.id).gte("created_at", since),
      supabase.from("app_config").select("value").eq("key", "weekly_contact_target").single(),
    ]);
  const weeks = splitWeeks((contacts ?? []).map((c) => c.occurred_at));

  return (
    <AppShell
      title={`${me.display_name} 님, 좋은 아침이에요`}
      subtitle="오늘의 한 걸음만 하면 충분해요"
      right={<form action={logout}><button className="text-xs text-sub underline">로그아웃</button></form>}
    >
      {!checkin ? (
        <Card tone="ai">
          <p className="mb-3 text-sm text-ink">지금 기분은 어느 쪽에 가까워요?</p>
          <MoodPicker action={checkIn} />
        </Card>
      ) : step ? (
        <StepCard text={step.text} done={!!step.done_at} doneAction={completeStep} smallerAction={smallerStep} />
      ) : (
        <Card><p className="text-sm">오늘의 걸음을 준비하고 있어요.</p><MoodPicker action={checkIn} selected={checkin.mood as MoodValue} /></Card>
      )}

      {stage?.proposed_stage != null && <StageProposal proposed={stage.proposed_stage} action={respondStage} />}

      <NavLink href="/youth/chat">선배와 주고받기</NavLink>

      <ContactWeeks lastWeek={weeks.lastWeek} thisWeek={weeks.thisWeek} target={target?.value ?? 3} reactions={reactionCount ?? 0} />

      <Card>
        <Label>나의 걸음</Label>
        <div className="mt-2"><StageLadder stage={stage?.stage ?? 0} /></div>
      </Card>
    </AppShell>
  );
}
