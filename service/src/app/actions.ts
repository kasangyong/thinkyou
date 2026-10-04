"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, createServiceClient, getMe } from "@/lib/supabase/server";
import { detectCrisis } from "@/lib/crisis";
import { suggestStep, type Mood, type StepSize } from "@/lib/gemini";

export type FormState = { error?: string } | undefined;

async function requireRole(roles: string[]) {
  const me = await getMe();
  if (!me || !roles.includes(me.role)) throw new Error("권한이 없습니다.");
  return me;
}

// ───────── 인증 ─────────
export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });
  if (error) return { error: "이메일 또는 비밀번호가 맞지 않아요." };
  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// 초대 코드가 있어야 가입할 수 있다(실제 위기 청년의 유입을 막기 위한 시연 정책).
export async function signup(_: FormState, formData: FormData): Promise<FormState> {
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!process.env.INVITE_CODE || code !== process.env.INVITE_CODE) return { error: "초대 코드가 맞지 않아요." };
  if (!name || name.length > 20) return { error: "이름은 1~20자로 적어 주세요." };
  if (password.length < 8) return { error: "비밀번호는 8자 이상이어야 해요." };

  const admin = createServiceClient();
  const { data: firstYouth } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "youth")
    .eq("demo_set", 1)
    .order("created_at")
    .limit(1)
    .single();
  const { data: set1 } = firstYouth
    ? await admin
        .from("assignments")
        .select("mentor_id, counselor_id, backup_id, crisis_team_id")
        .eq("youth_id", firstYouth.id)
        .single()
    : { data: null };
  if (!set1) return { error: "데모 세트가 아직 준비되지 않았어요. 관리자에게 알려 주세요." };

  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !created.user) return { error: "가입하지 못했어요. 이미 쓰는 이메일인지 확인해 주세요." };
  const id = created.user.id;
  await admin.from("profiles").insert({ id, role: "youth", display_name: name, demo_set: 1 });
  await admin.from("assignments").insert({
    youth_id: id,
    mentor_id: set1.mentor_id,
    counselor_id: set1.counselor_id,
    backup_id: set1.backup_id,
    crisis_team_id: set1.crisis_team_id,
  });
  await admin.rpc("seed_youth_state", { p_youth: id, p_mode: "fresh" });

  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email, password });
  redirect("/");
}

// ───────── 청년: 하루 루틴 ─────────
export async function checkIn(formData: FormData) {
  const me = await requireRole(["youth"]);
  const mood = String(formData.get("mood")) as Mood;
  if (!["hard", "ok", "good"].includes(mood)) return;
  const supabase = await createClient();
  await supabase.from("checkins").upsert({ youth_id: me.id, day: today(), mood }, { onConflict: "youth_id,day" });
  await makeStep(me.id, mood, mood === "hard" ? "small" : "normal");
  revalidatePath("/youth");
}

export async function smallerStep() {
  const me = await requireRole(["youth"]);
  const supabase = await createClient();
  const { data: c } = await supabase.from("checkins").select("mood").eq("youth_id", me.id).order("day", { ascending: false }).limit(1).single();
  await makeStep(me.id, (c?.mood as Mood) ?? "ok", "small");
  revalidatePath("/youth");
}

export async function completeStep() {
  const me = await requireRole(["youth"]);
  const supabase = await createClient();
  await supabase.from("daily_steps").update({ done_at: new Date().toISOString() }).eq("youth_id", me.id).eq("day", today());
  await supabase.from("reactions").insert({ youth_id: me.id, kind: "self_check" });
  revalidatePath("/youth");
}

async function makeStep(youthId: string, mood: Mood, size: StepSize) {
  const supabase = await createClient();
  const [{ data: st }, { data: recent }] = await Promise.all([
    supabase.from("stage_state").select("stage").eq("youth_id", youthId).single(),
    supabase.from("daily_steps").select("text").eq("youth_id", youthId).order("day", { ascending: false }).limit(3),
  ]);
  const text = await suggestStep({
    mood,
    size,
    stage: st?.stage ?? 0,
    recentSteps: (recent ?? []).map((r) => r.text),
  });
  await supabase
    .from("daily_steps")
    .upsert({ youth_id: youthId, day: today(), text, size, done_at: null }, { onConflict: "youth_id,day" });
}

export async function respondStage(formData: FormData) {
  await requireRole(["youth"]);
  const supabase = await createClient();
  await supabase.rpc("respond_stage_proposal", { p_accept: formData.get("accept") === "yes" });
  revalidatePath("/youth");
}

// ───────── 선배와 주고받기 ─────────
export async function sendMessage(formData: FormData) {
  const me = await requireRole(["youth", "mentor"]);
  const youthId = me.role === "youth" ? me.id : String(formData.get("youthId"));
  const body = String(formData.get("body") ?? "").trim();
  if (!body || body.length > 1000) return;
  const kind = /^\p{Extended_Pictographic}+$/u.test(body) ? "emoji" : "text";

  const supabase = await createClient();
  const { data: msg, error } = await supabase
    .from("messages")
    .insert({ youth_id: youthId, sender_id: me.id, body, kind })
    .select("id")
    .single();
  if (error || !msg) throw new Error("메시지를 보내지 못했어요.");

  const back = me.role === "youth" ? "/youth/chat" : `/mentor/${youthId}`;
  if (me.role === "youth") {
    const severity = detectCrisis(body);
    if (severity) {
      await supabase.rpc("raise_crisis", { p_message: msg.id, p_severity: severity, p_excerpt: body });
      revalidatePath(back);
      redirect(`${back}?crisis=1`);
    }
  }
  revalidatePath(back);
}

// ───────── 돌봄(상담사·예비 담당·위기대응팀) ─────────
export async function ackAlert(formData: FormData) {
  await requireRole(["counselor", "backup", "crisis_team"]);
  const supabase = await createClient();
  await supabase.rpc("ack_alert", { p_alert: String(formData.get("alertId")) });
  revalidatePath("/care");
}

export async function recomputeStages() {
  const me = await requireRole(["counselor"]);
  const supabase = await createClient();
  const { data: rows } = await supabase.from("assignments").select("youth_id").eq("counselor_id", me.id);
  for (const r of rows ?? []) await supabase.rpc("compute_stage_proposal", { p_youth: r.youth_id });
  revalidatePath("/care");
}

export async function resetDemo(formData: FormData) {
  await requireRole(["counselor", "mentor"]);
  const mode = formData.get("mode") === "four_weeks" ? "four_weeks" : "fresh";
  const supabase = await createClient();
  await supabase.rpc("reset_my_demo_set", { p_mode: mode });
  revalidatePath("/", "layout");
}

function today() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
}
