import "server-only";
import { hashPassword } from "./auth";
import { one, sql } from "./db";

// 계정이 하나도 없으면 데모 계정을 만든다(scripts/seed.mjs와 같은 구성).
// Vercel의 DB 접속 정보는 밖으로 꺼낼 수 없어서, 첫 로그인 시도 때 서버에서 만든다.
const ACCOUNTS = [
  { email: "backup@demo.oneul", role: "backup", name: "예비 상담사 박○○", set: 0 },
  { email: "crisis@demo.oneul", role: "crisis_team", name: "24시간 위기대응팀(시뮬레이션)", set: 0 },
  ...[1, 2, 3].flatMap((n) => [
    { email: `youth${n}@demo.oneul`, role: "youth", name: ["지훈", "서윤", "민재"][n - 1], set: n },
    { email: `mentor${n}@demo.oneul`, role: "mentor", name: ["해솔", "다온", "이음"][n - 1], set: n },
    { email: `counselor${n}@demo.oneul`, role: "counselor", name: `상담사 김○○ (${n}세트)`, set: n },
  ]),
];

export async function ensureDemoAccounts() {
  const password = process.env.DEMO_PASSWORD;
  if (!password) return;
  const existing = await one<{ n: number }>(sql`select count(*)::int as n from profiles`);
  if ((existing?.n ?? 0) > 0) return;

  const ids: Record<string, string> = {};
  for (const a of ACCOUNTS) {
    const hash = await hashPassword(password);
    const row = await one<{ id: string }>(sql`
      insert into profiles(email, password_hash, role, display_name, demo_set)
      values (${a.email}, ${hash}, ${a.role}, ${a.name}, ${a.set})
      on conflict (email) do nothing returning id`);
    if (row) ids[a.email] = row.id;
  }
  for (const n of [1, 2, 3]) {
    const youth = ids[`youth${n}@demo.oneul`];
    if (!youth) continue;
    await sql`
      insert into assignments(youth_id, mentor_id, counselor_id, backup_id, crisis_team_id)
      values (${youth}, ${ids[`mentor${n}@demo.oneul`]}, ${ids[`counselor${n}@demo.oneul`]},
              ${ids["backup@demo.oneul"]}, ${ids["crisis@demo.oneul"]})
      on conflict (youth_id) do nothing`;
    await sql`select seed_youth_state(${youth}, 'fresh')`;
  }
}
