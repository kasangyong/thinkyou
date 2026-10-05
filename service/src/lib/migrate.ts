import "server-only";
import { sql } from "./db";

// 배포 후 스키마를 다시 실행하지 않아도 되도록, 작은 컬럼 추가는 앱이 처음 요청을 받을 때 적용한다.
// 모두 여러 번 실행해도 안전한 문장만 둔다. 같은 내용이 db/schema.sql에도 있다.
let done: Promise<void> | null = null;

// 두 인스턴스가 동시에 create table if not exists를 실행하면 한쪽이 23505/42P07로 실패할 수 있다. 이미 만들어졌다는 뜻이라 넘어간다
async function ddl(query: Promise<unknown>) {
  try {
    await query;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code !== "23505" && code !== "42P07") throw e;
  }
}

// 상시 대기실의 시연용 예시 공고. 실제 기관·일정이 아니다. 날짜는 배포 시점 기준으로 다시 맞춘다.
const PROGRAMS = [
  { id: "listen-room", minStage: 2, title: "카메라 없이 듣기만 하는 온라인 모임", org: "지역 청년센터 (예시)", summary: "주 1회 40분. 말하지 않고 채팅으로만 참여해도 됩니다.", until: 6, start: 10 },
  { id: "voice-trio", minStage: 3, title: "2~3인 음성 소모임 4주", org: "청년미래센터 (예시)", summary: "선배 1명과 또래 1~2명이 짧게 목소리로 이야기합니다.", until: 9, start: 14 },
  { id: "home-work", minStage: 3, title: "재택 일경험 챌린지 (하루 30분)", org: "재택 일경험 과정 (예시)", summary: "집에서 하루 30분, 작은 과제를 하고 기록을 남깁니다.", until: 12, start: 18 },
  { id: "walk-challenge", minStage: 4, title: "동네 걷기 챌린지", org: "구 보건소 (예시)", summary: "하루 10분 걷고 사진 한 장을 올립니다. 혼자 걸어도 됩니다.", until: 5, start: 8 },
  { id: "center-visit", minStage: 4, title: "청년센터 공간 둘러보기", org: "지역 청년센터 (예시)", summary: "선배와 함께 센터 공간을 30분 둘러봅니다.", until: 15, start: 20 },
  { id: "work-intern", minStage: 4, title: "청년 일경험 인턴 과정", org: "청년 일경험 과정 (예시)", summary: "주 3일, 하루 4시간 일경험. 담당 상담사와 함께 준비합니다.", until: 20, start: 30 },
];

export function ensureMigrations() {
  done ??= (async () => {
    await ddl(sql`alter table daily_steps add column if not exists feedback text`);
    await ddl(sql`
      create table if not exists programs (
        id text primary key,
        min_stage integer not null,
        title text not null,
        org text not null,
        summary text not null,
        recruit_until date not null,
        starts_on date not null
      )`);
    await ddl(sql`
      create table if not exists applications (
        id uuid primary key default gen_random_uuid(),
        youth_id uuid not null references profiles(id) on delete cascade,
        program_id text not null references programs(id),
        draft text not null,
        status text not null default 'draft' check (status in ('draft','sent')),
        created_at timestamptz not null default now(),
        sent_at timestamptz,
        unique (youth_id, program_id)
      )`);
    await ddl(sql`
      create table if not exists reconnect_promises (
        youth_id uuid primary key references profiles(id) on delete cascade,
        after_days integer not null check (after_days in (14, 30)),
        agreed_at timestamptz not null default now(),
        returned_at timestamptz
      )`);
    for (const p of PROGRAMS) {
      await sql`
        insert into programs(id, min_stage, title, org, summary, recruit_until, starts_on)
        values (${p.id}, ${p.minStage}, ${p.title}, ${p.org}, ${p.summary},
                current_date + ${p.until}::int, current_date + ${p.start}::int)
        on conflict (id) do update set min_stage = excluded.min_stage, title = excluded.title, org = excluded.org,
          summary = excluded.summary, recruit_until = excluded.recruit_until, starts_on = excluded.starts_on`;
    }
  })().catch((e) => {
    done = null;
    throw e;
  });
  return done;
}
