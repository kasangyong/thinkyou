// 데모 계정과 초기 상태를 만든다. 여러 번 실행해도 같은 결과가 나온다.
// 실행: node --env-file=.env.local scripts/seed.mjs
import { neon } from "@neondatabase/serverless";
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const { DATABASE_URL, DEMO_PASSWORD } = process.env;
if (!DATABASE_URL || !DEMO_PASSWORD) {
  console.error("DATABASE_URL, DEMO_PASSWORD 가 필요합니다.");
  process.exit(1);
}
const sql = neon(DATABASE_URL);

// src/lib/auth.ts 의 hashPassword 와 같은 형식
async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt$${salt}$${hash.toString("hex")}`;
}

const accounts = [
  { email: "backup@demo.oneul", role: "backup", name: "예비 상담사 박○○", set: 0 },
  { email: "crisis@demo.oneul", role: "crisis_team", name: "24시간 위기대응팀(시뮬레이션)", set: 0 },
  ...[1, 2, 3].flatMap((n) => [
    { email: `youth${n}@demo.oneul`, role: "youth", name: ["지훈", "서윤", "민재"][n - 1], set: n },
    { email: `mentor${n}@demo.oneul`, role: "mentor", name: ["해솔", "다온", "이음"][n - 1], set: n },
    { email: `counselor${n}@demo.oneul`, role: "counselor", name: `상담사 김○○ (${n}세트)`, set: n },
  ]),
];

const ids = {};
for (const a of accounts) {
  const hash = await hashPassword(DEMO_PASSWORD);
  const [row] = await sql`
    insert into profiles(email, password_hash, role, display_name, demo_set)
    values (${a.email}, ${hash}, ${a.role}, ${a.name}, ${a.set})
    on conflict (email) do update
      set password_hash = excluded.password_hash, role = excluded.role,
          display_name = excluded.display_name, demo_set = excluded.demo_set
    returning id`;
  ids[a.email] = row.id;
}

for (const n of [1, 2, 3]) {
  const youth = ids[`youth${n}@demo.oneul`];
  await sql`
    insert into assignments(youth_id, mentor_id, counselor_id, backup_id, crisis_team_id)
    values (${youth}, ${ids[`mentor${n}@demo.oneul`]}, ${ids[`counselor${n}@demo.oneul`]},
            ${ids["backup@demo.oneul"]}, ${ids["crisis@demo.oneul"]})
    on conflict (youth_id) do update
      set mentor_id = excluded.mentor_id, counselor_id = excluded.counselor_id,
          backup_id = excluded.backup_id, crisis_team_id = excluded.crisis_team_id`;
  await sql`select seed_youth_state(${youth}, 'fresh')`;
}

console.log("데모 계정 준비 완료:", Object.keys(ids).join(", "));
