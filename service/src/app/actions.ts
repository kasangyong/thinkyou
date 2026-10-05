"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { one, rows, sql } from "@/lib/db";
import { canUseThread, endSession, hashPassword, requireRole, startSession, verifyPassword } from "@/lib/auth";
import { detectCrisis } from "@/lib/crisis";
import { ensureDemoAccounts } from "@/lib/demo";
import { kstDay } from "@/lib/format";
import { aiReply, draftApplication, suggestStep, type Feedback, type Mood, type StepSize } from "@/lib/gemini";
import { ensureMigrations } from "@/lib/migrate";
import { loadAway } from "@/lib/reconnect";
import { aiLimit, aiUsedToday } from "@/lib/ai-chat";

// 오류가 나도 입력값(비밀번호 제외)을 돌려줘서 다시 채워 준다
export type FormState = { error?: string; values?: Record<string, string> } | undefined;

// ───────── 인증 ─────────
export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  await ensureDemoAccounts();
  const user = await one<{ id: string; password_hash: string }>(
    sql`select id, password_hash from profiles where email = ${email}`,
  );
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return { error: "이메일 또는 비밀번호가 맞지 않아요.", values: { email } };
  }
  await startSession(user.id);
  redirect("/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}

// 초대 코드가 있어야 가입할 수 있다(실제 위기 청년의 유입을 막기 위한 시연 정책).
export async function signup(_: FormState, formData: FormData): Promise<FormState> {
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!process.env.INVITE_CODE || code !== process.env.INVITE_CODE) return { error: "초대 코드가 맞지 않아요.", values: { code, name, email } };
  if (!name || name.length > 20) return { error: "이름은 1~20자로 적어 주세요.", values: { code, name, email } };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "이메일 형식을 확인해 주세요.", values: { code, name, email } };
  if (password.length < 8) return { error: "비밀번호는 8자 이상이어야 해요.", values: { code, name, email } };

  // 새 청년은 1세트의 선배·상담사에게 배정한다(아직 데모 계정이 없으면 먼저 만든다)
  await ensureDemoAccounts();
  const set1 = await one<{ mentor_id: string; counselor_id: string; backup_id: string; crisis_team_id: string }>(sql`
    select a.mentor_id, a.counselor_id, a.backup_id, a.crisis_team_id
      from assignments a join profiles p on p.id = a.youth_id
     where p.demo_set = 1 order by p.created_at limit 1`);
  if (!set1) return { error: "데모 세트가 아직 준비되지 않았어요. 관리자에게 알려 주세요.", values: { code, name, email } };

  const exists = await one(sql`select 1 from profiles where email = ${email}`);
  if (exists) return { error: "이미 가입한 이메일이에요.", values: { code, name, email } };

  const hash = await hashPassword(password);
  const user = await one<{ id: string }>(sql`
    insert into profiles(email, password_hash, role, display_name, demo_set)
    values (${email}, ${hash}, 'youth', ${name}, 1) returning id`);
  if (!user) return { error: "가입하지 못했어요. 잠시 뒤 다시 시도해 주세요.", values: { code, name, email } };
  await sql`insert into assignments(youth_id, mentor_id, counselor_id, backup_id, crisis_team_id)
            values (${user.id}, ${set1.mentor_id}, ${set1.counselor_id}, ${set1.backup_id}, ${set1.crisis_team_id})`;
  await sql`select seed_youth_state(${user.id}, 'fresh')`;

  await startSession(user.id);
  redirect("/");
}

// ───────── 청년: 하루 루틴 ─────────
export async function checkIn(formData: FormData) {
  const me = await requireRole(["youth"]);
  const mood = String(formData.get("mood")) as Mood;
  if (!["hard", "ok", "good"].includes(mood)) return;
  await sql`insert into checkins(youth_id, day, mood) values (${me.id}, ${kstDay()}, ${mood})
            on conflict (youth_id, day) do update set mood = excluded.mood`;
  await makeStep(me.id, mood, mood === "hard" ? "small" : "normal");
  revalidatePath("/youth");
}

export async function smallerStep() {
  const me = await requireRole(["youth"]);
  const [c, cur] = await Promise.all([
    one<{ mood: Mood }>(sql`select mood from checkins where youth_id = ${me.id} order by day desc limit 1`),
    one<{ text: string }>(sql`select text from daily_steps where youth_id = ${me.id} and day = ${kstDay()}`),
  ]);
  // 지금 걸음을 알려 줘야 그보다 작은 걸음이 나온다
  await makeStep(me.id, c?.mood ?? "ok", "small", cur?.text ?? null);
  revalidatePath("/youth");
}

export async function completeStep() {
  const me = await requireRole(["youth"]);
  await sql`update daily_steps set done_at = now() where youth_id = ${me.id} and day = ${kstDay()}`;
  await sql`insert into reactions(youth_id, kind) values (${me.id}, 'self_check')`;
  revalidatePath("/youth");
}

async function makeStep(youthId: string, mood: Mood, size: StepSize, current: string | null = null) {
  await ensureMigrations();
  const [st, recent, last] = await Promise.all([
    one<{ stage: number }>(sql`select stage from stage_state where youth_id = ${youthId}`),
    rows<{ text: string }>(sql`select text from daily_steps where youth_id = ${youthId} order by day desc limit 3`),
    one<{ feedback: Feedback }>(sql`
      select feedback from daily_steps
       where youth_id = ${youthId} and day < ${kstDay()} and feedback is not null
       order by day desc limit 1`),
  ]);
  // 어제 걸음이 버거웠다면 오늘은 처음부터 작게
  if (last?.feedback === "hard") size = "small";
  const text = await suggestStep({
    mood,
    size,
    stage: st?.stage ?? 0,
    recentSteps: recent.map((r) => r.text),
    lastFeedback: last?.feedback ?? null,
    current,
  });
  await sql`insert into daily_steps(youth_id, day, text, size) values (${youthId}, ${kstDay()}, ${text}, ${size})
            on conflict (youth_id, day) do update set text = excluded.text, size = excluded.size, done_at = null`;
}

// 걸음을 마친 뒤 "쉬웠어요/딱 좋았어요/버거웠어요". 다음 날 걸음 크기에 반영한다.
export async function stepFeedback(formData: FormData) {
  const me = await requireRole(["youth"]);
  const value = String(formData.get("feedback"));
  if (!["easy", "right", "hard"].includes(value)) return;
  await ensureMigrations();
  await sql`update daily_steps set feedback = ${value} where youth_id = ${me.id} and day = ${kstDay()} and done_at is not null`;
  revalidatePath("/youth");
}

// 단계를 올릴지는 청년 본인이 정한다
export async function respondStage(formData: FormData) {
  const me = await requireRole(["youth"]);
  const accept = formData.get("accept") === "yes";
  // 수락이든 "다음에"든 그때부터 접촉을 다시 센다. 거절한 제안이 바로 다시 뜨지 않도록
  await sql`update stage_state
               set stage = case when ${accept}::boolean then proposed_stage else stage end,
                   stage_since = now(),
                   proposed_stage = null, proposed_at = null, updated_at = now()
             where youth_id = ${me.id} and proposed_stage is not null`;
  revalidatePath("/youth");
}

// ───────── 선배와 주고받기 ─────────
export async function sendMessage(formData: FormData) {
  const me = await requireRole(["youth", "mentor"]);
  const youthId = me.role === "youth" ? me.id : String(formData.get("youthId"));
  if (!(await canUseThread(me, youthId))) throw new Error("권한이 없습니다.");
  const body = String(formData.get("body") ?? "").trim();
  if (!body || body.length > 1000) return;
  const kind = /^\p{Extended_Pictographic}+$/u.test(body) ? "emoji" : "text";

  const msg = await one<{ id: string }>(sql`
    insert into messages(youth_id, sender_id, body, kind) values (${youthId}, ${me.id}, ${body}, ${kind}) returning id`);

  const back = me.role === "youth" ? "/youth/chat" : `/mentor/${youthId}`;
  if (me.role === "youth" && msg) {
    const severity = detectCrisis(body);
    if (severity) {
      await sql`select raise_crisis(${me.id}, ${msg.id}, ${severity}, ${body})`;
      revalidatePath(back);
      redirect(`${back}?crisis=1`);
    }
  }
  revalidatePath(back);
  // 주소에 남은 ?draft= 가 입력창을 다시 채우지 않도록 깨끗한 주소로 돌아간다
  redirect(back);
}

// ───────── 돌봄(상담사·예비 담당·위기대응팀) ─────────
export async function ackAlert(formData: FormData) {
  const me = await requireRole(["counselor", "backup", "crisis_team"]);
  const alertId = String(formData.get("alertId"));
  await sql`update alerts set acked_at = now() where id = ${alertId} and recipient_id = ${me.id} and acked_at is null`;
  revalidatePath("/care");
}

export async function recomputeStages() {
  const me = await requireRole(["counselor"]);
  await sql`select compute_stage_proposal(youth_id) from assignments where counselor_id = ${me.id}`;
  revalidatePath("/care");
}

// 누른 사람이 속한 데모 세트만 초기화한다
// away: 4주 뒤 상태에서 3주 동안 소식이 끊긴 상태(2주 재연결 약속). 돌아올 문 시연용
export async function resetDemo(formData: FormData) {
  const me = await requireRole(["counselor", "mentor"]);
  if (me.demo_set <= 0) throw new Error("데모 세트가 없는 계정입니다.");
  const raw = formData.get("mode");
  const mode = raw === "four_weeks" || raw === "away" ? raw : "fresh";
  await ensureMigrations();
  const youths = await rows<{ id: string }>(sql`select id from profiles where role = 'youth' and demo_set = ${me.demo_set}`);
  const ids = youths.map((y) => y.id);
  await sql`delete from applications where youth_id = any(${ids}::uuid[])`;
  await sql`delete from reconnect_promises where youth_id = any(${ids}::uuid[])`;
  await sql`delete from ai_messages where youth_id = any(${ids}::uuid[])`;
  await sql`select seed_youth_state(id, ${mode === "fresh" ? "fresh" : "four_weeks"}) from profiles where id = any(${ids}::uuid[])`;
  if (mode === "away") {
    await sql`update messages set created_at = created_at - interval '21 days' where youth_id = any(${ids}::uuid[])`;
    await sql`update contacts set occurred_at = occurred_at - interval '21 days' where youth_id = any(${ids}::uuid[])`;
    await sql`update reactions set created_at = created_at - interval '21 days' where youth_id = any(${ids}::uuid[])`;
    await sql`update stage_state set stage_since = stage_since - interval '21 days' where youth_id = any(${ids}::uuid[])`;
    await sql`insert into reconnect_promises(youth_id, after_days, agreed_at)
              select id, 14, now() - interval '35 days' from profiles where id = any(${ids}::uuid[])`;
  }
  revalidatePath("/", "layout");
}

// ───────── 상시 대기실 ─────────
// 모집 중이고 지금 단계 + 1 까지인 프로그램만 지원할 수 있다
async function fitProgram(youthId: string, programId: string) {
  return one<{ id: string; title: string; org: string; summary: string }>(sql`
    select p.id, p.title, p.org, p.summary from programs p
     where p.id = ${programId} and p.recruit_until >= current_date
       and p.min_stage <= coalesce((select stage from stage_state where youth_id = ${youthId}), 0) + 1`);
}

export async function makeDraft(formData: FormData) {
  const me = await requireRole(["youth"]);
  await ensureMigrations();
  const programId = String(formData.get("programId"));
  const program = await fitProgram(me.id, programId);
  if (!program) return;
  const [steps, contacts] = await Promise.all([
    rows<{ text: string }>(sql`
      select text from daily_steps where youth_id = ${me.id} and done_at is not null order by day desc limit 5`),
    one<{ n: number }>(sql`
      select count(*)::int as n from contacts where youth_id = ${me.id} and occurred_at >= now() - interval '28 days'`),
  ]);
  const draft = await draftApplication({ program, doneSteps: steps.map((s) => s.text), contacts4w: contacts?.n ?? 0 });
  // 이미 보낸 지원서는 다시 쓰지 않는다
  await sql`insert into applications(youth_id, program_id, draft) values (${me.id}, ${programId}, ${draft})
            on conflict (youth_id, program_id) do update set draft = excluded.draft
            where applications.status = 'draft'`;
  revalidatePath(`/youth/room/${programId}`);
}

// 본인이 고친 내용 그대로 보낸다. 시연에서는 담당 상담사 화면까지만 간다
export async function sendApplication(formData: FormData) {
  const me = await requireRole(["youth"]);
  await ensureMigrations();
  const programId = String(formData.get("programId"));
  const draft = String(formData.get("draft") ?? "").trim();
  if (!draft || draft.length > 1500 || !(await fitProgram(me.id, programId))) return;
  await sql`update applications set draft = ${draft}, status = 'sent', sent_at = now()
             where youth_id = ${me.id} and program_id = ${programId} and status = 'draft'`;
  revalidatePath(`/youth/room/${programId}`);
  revalidatePath("/youth/room");
}

// ───────── 재연결 약속 ─────────
export async function setPromise(formData: FormData) {
  const me = await requireRole(["youth"]);
  await ensureMigrations();
  const days = Number(formData.get("days"));
  if (days !== 14 && days !== 30) return;
  await sql`insert into reconnect_promises(youth_id, after_days) values (${me.id}, ${days})
            on conflict (youth_id) do update set after_days = excluded.after_days, agreed_at = now(), returned_at = null`;
  revalidatePath("/youth");
}

export async function dropPromise() {
  const me = await requireRole(["youth"]);
  await ensureMigrations();
  await sql`delete from reconnect_promises where youth_id = ${me.id}`;
  revalidatePath("/youth");
}

// 돌아올 문: 지금 단계 그대로 또는 한 단계 낮춰서(1단계 아래로는 내리지 않음) 다시 시작한다
export async function comeBack(formData: FormData) {
  const me = await requireRole(["youth"]);
  await ensureMigrations();
  if (!(await loadAway([me.id])).has(me.id)) return;
  if (formData.get("lower") === "yes") {
    await sql`update stage_state set stage = greatest(1, stage - 1), stage_since = now(),
                     proposed_stage = null, proposed_at = null, updated_at = now()
               where youth_id = ${me.id} and stage > 1`;
  }
  await sql`update reconnect_promises set returned_at = now() where youth_id = ${me.id}`;
  revalidatePath("/youth");
}

// ───────── AI와 이야기하기 ─────────
// 하루 횟수를 다 써도 위기 감지는 항상 동작한다
export async function sendAi(formData: FormData) {
  const me = await requireRole(["youth"]);
  await ensureMigrations();
  const body = String(formData.get("body") ?? "").trim();
  if (!body || body.length > 1000) return;

  const severity = detectCrisis(body);
  if (severity) {
    await sql`insert into ai_messages(youth_id, role, body, crisis) values (${me.id}, 'youth', ${body}, true)`;
    await sql`select raise_crisis(${me.id}, null, ${severity}, ${body})`;
    await sql`insert into ai_messages(youth_id, role, body, crisis)
              values (${me.id}, 'ai', '지금은 사람과 이야기하는 게 먼저예요. 109에 전화하면 바로 사람과 이어지고, 담당 상담사에게도 알렸어요.', true)`;
    revalidatePath("/youth/ai");
    redirect("/youth/ai?crisis=1");
  }

  const [st, used, mentor] = await Promise.all([
    one<{ stage: number }>(sql`select stage from stage_state where youth_id = ${me.id}`),
    aiUsedToday(me.id),
    one<{ display_name: string }>(sql`
      select p.display_name from assignments a join profiles p on p.id = a.mentor_id where a.youth_id = ${me.id}`),
  ]);
  const stage = st?.stage ?? 0;
  const limit = aiLimit(stage);
  if (used >= limit) return;

  await sql`insert into ai_messages(youth_id, role, body) values (${me.id}, 'youth', ${body})`;
  const recent = await rows<{ role: "youth" | "ai"; body: string }>(sql`
    select role, body from (
      select role, body, created_at from ai_messages where youth_id = ${me.id} and not crisis order by created_at desc limit 10
    ) t order by created_at`);
  const reply = await aiReply({ history: recent, stage, mentorName: mentor?.display_name ?? "선배", remaining: limit - used - 1 });
  await sql`insert into ai_messages(youth_id, role, body) values (${me.id}, 'ai', ${reply})`;
  revalidatePath("/youth/ai");
  revalidatePath("/youth");
  redirect("/youth/ai");
}
