"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { one, rows, sql } from "@/lib/db";
import { canUseThread, endSession, hashPassword, requireRole, startSession, verifyPassword } from "@/lib/auth";
import { detectCrisis } from "@/lib/crisis";
import { ensureDemoAccounts } from "@/lib/demo";
import { kstDay } from "@/lib/format";
import { suggestStep, type Feedback, type Mood, type StepSize } from "@/lib/gemini";
import { ensureMigrations } from "@/lib/migrate";

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
  await sql`update stage_state
               set stage = case when ${accept}::boolean then proposed_stage else stage end,
                   stage_since = case when ${accept}::boolean then now() else stage_since end,
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
export async function resetDemo(formData: FormData) {
  const me = await requireRole(["counselor", "mentor"]);
  if (me.demo_set <= 0) throw new Error("데모 세트가 없는 계정입니다.");
  const mode = formData.get("mode") === "four_weeks" ? "four_weeks" : "fresh";
  await sql`select seed_youth_state(id, ${mode}) from profiles where role = 'youth' and demo_set = ${me.demo_set}`;
  revalidatePath("/", "layout");
}
