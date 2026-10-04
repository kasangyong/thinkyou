// 데모 계정과 초기 상태를 만든다. 여러 번 실행해도 같은 결과가 나온다.
// 실행: node --env-file=.env.local scripts/seed.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEMO_PASSWORD;
if (!url || !serviceKey || !password) {
  console.error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_PASSWORD 가 필요합니다.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const shared = [
  { email: "backup@demo.oneul", role: "backup", display_name: "예비 상담사 박○○", demo_set: 0 },
  { email: "crisis@demo.oneul", role: "crisis_team", display_name: "24시간 위기대응팀(시뮬레이션)", demo_set: 0 },
];
const sets = [1, 2, 3].flatMap((n) => [
  { email: `youth${n}@demo.oneul`, role: "youth", display_name: ["지훈", "서윤", "민재"][n - 1], demo_set: n },
  { email: `mentor${n}@demo.oneul`, role: "mentor", display_name: ["해솔", "다온", "이음"][n - 1], demo_set: n },
  { email: `counselor${n}@demo.oneul`, role: "counselor", display_name: `상담사 김○○ (${n}세트)`, demo_set: n },
]);

async function ensureUser(p) {
  const { data: list, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  let user = list.users.find((u) => u.email === p.email);
  if (!user) {
    const { data, error: e } = await admin.auth.admin.createUser({
      email: p.email,
      password,
      email_confirm: true,
    });
    if (e) throw e;
    user = data.user;
  } else {
    await admin.auth.admin.updateUserById(user.id, { password });
  }
  const { error: pe } = await admin
    .from("profiles")
    .upsert({ id: user.id, role: p.role, display_name: p.display_name, demo_set: p.demo_set });
  if (pe) throw pe;
  return user.id;
}

const ids = {};
for (const p of [...shared, ...sets]) ids[p.email] = await ensureUser(p);

for (const n of [1, 2, 3]) {
  const youth = ids[`youth${n}@demo.oneul`];
  const { error } = await admin.from("assignments").upsert({
    youth_id: youth,
    mentor_id: ids[`mentor${n}@demo.oneul`],
    counselor_id: ids[`counselor${n}@demo.oneul`],
    backup_id: ids["backup@demo.oneul"],
    crisis_team_id: ids["crisis@demo.oneul"],
  });
  if (error) throw error;
  const { error: se } = await admin.rpc("seed_youth_state", { p_youth: youth, p_mode: "fresh" });
  if (se) throw se;
}

console.log("데모 계정 준비 완료:", Object.keys(ids).join(", "));
