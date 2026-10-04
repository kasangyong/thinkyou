-- 오늘한걸음 MVP 스키마
-- Supabase SQL Editor에서 한 번 실행한다. 여러 번 실행해도 안전하도록 작성했다.

create extension if not exists pgcrypto;

-- ───────────────────────── 설정 ─────────────────────────
create table if not exists app_config (
  key text primary key,
  value integer not null
);
insert into app_config(key, value) values
  ('escalation_seconds', 60),      -- 위기 알림 재전달 간격(실서비스 1800, 시연 60)
  ('pair_window_hours', 72),       -- 양방향 접촉 응답 인정 시간
  ('weekly_contact_target', 3),    -- 단계 제안 기준: 주당 양방향 접촉 수
  ('stage_window_days', 14)        -- 단계 제안 기준 기간(2주)
on conflict (key) do nothing;

create or replace function cfg(p_key text) returns integer
language sql stable as $$ select value from app_config where key = p_key $$;

-- ───────────────────────── 사용자 ─────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('youth','mentor','counselor','backup','crisis_team')),
  display_name text not null,
  demo_set integer not null default 0,   -- 0 = 모든 세트 공용(예비 담당, 위기대응팀)
  consent_reconnect boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists assignments (
  youth_id uuid primary key references profiles(id) on delete cascade,
  mentor_id uuid not null references profiles(id),
  counselor_id uuid not null references profiles(id),
  backup_id uuid not null references profiles(id),
  crisis_team_id uuid not null references profiles(id)
);

-- ───────────────────────── 하루 루틴 ─────────────────────────
create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  youth_id uuid not null references profiles(id) on delete cascade,
  day date not null default current_date,
  mood text not null check (mood in ('hard','ok','good')),
  created_at timestamptz not null default now(),
  unique (youth_id, day)
);

create table if not exists daily_steps (
  id uuid primary key default gen_random_uuid(),
  youth_id uuid not null references profiles(id) on delete cascade,
  day date not null default current_date,
  text text not null,
  size text not null default 'normal' check (size in ('normal','small')),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  unique (youth_id, day)
);

-- ───────────────────────── 선배와 주고받기 ─────────────────────────
-- 청년 1명당 대화방 1개(youth_id로 식별)
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  youth_id uuid not null references profiles(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  body text not null check (char_length(body) between 1 and 1000),
  kind text not null default 'text' check (kind in ('text','emoji')),
  created_at timestamptz not null default now()
);
create index if not exists messages_youth_time on messages(youth_id, created_at);

-- 단방향 반응(열람·이모지 등): 참고 지표로만 센다
create table if not exists reactions (
  id uuid primary key default gen_random_uuid(),
  youth_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('read','emoji','attend_only','self_check')),
  created_at timestamptz not null default now()
);

-- 양방향 접촉(성과 지표)
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  youth_id uuid not null references profiles(id) on delete cascade,
  source text not null check (source in ('message_pair','meeting_talk','offline_confirmed')),
  message_id uuid references messages(id) on delete cascade,
  occurred_at timestamptz not null default now()
);
create index if not exists contacts_youth_time on contacts(youth_id, occurred_at);

create table if not exists stage_state (
  youth_id uuid primary key references profiles(id) on delete cascade,
  stage integer not null default 0 check (stage between 0 and 4),
  proposed_stage integer check (proposed_stage between 1 and 4),
  proposed_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ───────────────────────── 위기 대응 ─────────────────────────
create table if not exists crisis_events (
  id uuid primary key default gen_random_uuid(),
  youth_id uuid not null references profiles(id) on delete cascade,
  message_id uuid references messages(id) on delete set null,
  severity text not null check (severity in ('high','urgent')),
  excerpt text not null,
  created_at timestamptz not null default now()
);

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  crisis_event_id uuid not null references crisis_events(id) on delete cascade,
  youth_id uuid not null references profiles(id) on delete cascade,
  recipient_id uuid not null references profiles(id),
  level text not null check (level in ('primary','backup','emergency')),
  created_at timestamptz not null default now(),
  acked_at timestamptz,
  unique (crisis_event_id, level)
);

-- ───────────────────────── 권한 확인 함수 ─────────────────────────
-- RLS 정책끼리 서로 참조하면 무한 재귀가 나므로, 확인은 security definer 함수로만 한다.
create or replace function my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function my_demo_set() returns integer
language sql stable security definer set search_path = public as $$
  select demo_set from profiles where id = auth.uid()
$$;

-- 내가 이 청년 본인이거나 담당자인가
create or replace function is_my_youth(p_youth uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_youth = auth.uid() or exists (
    select 1 from assignments a
    where a.youth_id = p_youth
      and auth.uid() in (a.mentor_id, a.counselor_id, a.backup_id, a.crisis_team_id)
  )
$$;

-- 메시지는 청년 본인과 담당 선배만 본다(상담사는 위기 알림으로만 본다)
create or replace function is_my_thread(p_youth uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_youth = auth.uid() or exists (
    select 1 from assignments a where a.youth_id = p_youth and a.mentor_id = auth.uid()
  )
$$;

-- ───────────────────────── RLS ─────────────────────────
alter table app_config enable row level security;
alter table profiles enable row level security;
alter table assignments enable row level security;
alter table checkins enable row level security;
alter table daily_steps enable row level security;
alter table messages enable row level security;
alter table reactions enable row level security;
alter table contacts enable row level security;
alter table stage_state enable row level security;
alter table crisis_events enable row level security;
alter table alerts enable row level security;

drop policy if exists cfg_read on app_config;
create policy cfg_read on app_config for select to authenticated using (true);

drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select to authenticated
  using (id = auth.uid() or my_demo_set() = 0 or demo_set in (0, my_demo_set()));

drop policy if exists profiles_update_self on profiles;

drop policy if exists assignments_read on assignments;
create policy assignments_read on assignments for select to authenticated
  using (is_my_youth(youth_id));

drop policy if exists checkins_self on checkins;
create policy checkins_self on checkins for all to authenticated
  using (youth_id = auth.uid()) with check (youth_id = auth.uid());

drop policy if exists steps_self on daily_steps;
create policy steps_self on daily_steps for all to authenticated
  using (youth_id = auth.uid()) with check (youth_id = auth.uid());

drop policy if exists messages_read on messages;
create policy messages_read on messages for select to authenticated
  using (is_my_thread(youth_id));

drop policy if exists messages_insert on messages;
create policy messages_insert on messages for insert to authenticated
  with check (sender_id = auth.uid() and is_my_thread(youth_id));

drop policy if exists reactions_self on reactions;
create policy reactions_self on reactions for all to authenticated
  using (youth_id = auth.uid()) with check (youth_id = auth.uid());

drop policy if exists contacts_read on contacts;
create policy contacts_read on contacts for select to authenticated
  using (is_my_youth(youth_id));

drop policy if exists stage_read on stage_state;
create policy stage_read on stage_state for select to authenticated
  using (is_my_youth(youth_id));

drop policy if exists crisis_read on crisis_events;
create policy crisis_read on crisis_events for select to authenticated
  using (exists (select 1 from alerts al where al.crisis_event_id = crisis_events.id and al.recipient_id = auth.uid()));

drop policy if exists alerts_read on alerts;
create policy alerts_read on alerts for select to authenticated
  using (recipient_id = auth.uid());

-- ───────────────────────── 양방향 접촉 판정 ─────────────────────────
-- 직전 메시지의 발신자가 상대방이고 응답 인정 시간 안이면 1쌍. 연속 메시지·이모지는 쌍이 아니다.
create or replace function on_message_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  prev messages%rowtype;
begin
  if new.kind = 'emoji' then
    insert into reactions(youth_id, kind) values (new.youth_id, 'emoji');
    return new;
  end if;

  select * into prev from messages
   where youth_id = new.youth_id and id <> new.id
     and (created_at, id) < (new.created_at, new.id)
   order by created_at desc, id desc limit 1;

  if found and prev.kind <> 'emoji' and prev.sender_id <> new.sender_id
     and new.created_at - prev.created_at <= make_interval(hours => cfg('pair_window_hours')) then
    insert into contacts(youth_id, source, message_id, occurred_at)
      values (new.youth_id, 'message_pair', new.id, new.created_at);

    -- 첫 양방향 대화가 생기면 2단계가 열린다
    insert into stage_state(youth_id, stage) values (new.youth_id, 2)
      on conflict (youth_id) do update
        set stage = greatest(stage_state.stage, 2), updated_at = now()
        where stage_state.stage < 2;
  end if;
  return new;
end $$;

drop trigger if exists trg_message_insert on messages;
create trigger trg_message_insert after insert on messages
  for each row execute function on_message_insert();

-- ───────────────────────── 단계 제안·수락 ─────────────────────────
-- 2단계부터: 최근 2주 각 주에 양방향 접촉이 목표 이상이면 다음 단계를 제안한다.
create or replace function compute_stage_proposal(p_youth uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  st stage_state%rowtype;
  half integer := cfg('stage_window_days') / 2;
  target integer := cfg('weekly_contact_target');
  recent integer; earlier integer;
begin
  if not is_my_youth(p_youth) then raise exception 'not allowed'; end if;
  select * into st from stage_state where youth_id = p_youth;
  if not found or st.stage < 2 or st.stage >= 4 or st.proposed_stage is not null then
    return st.proposed_stage;
  end if;

  select count(*) into recent from contacts
   where youth_id = p_youth and occurred_at >= now() - make_interval(days => half);
  select count(*) into earlier from contacts
   where youth_id = p_youth
     and occurred_at <  now() - make_interval(days => half)
     and occurred_at >= now() - make_interval(days => half * 2);

  if recent >= target and earlier >= target then
    update stage_state set proposed_stage = st.stage + 1, proposed_at = now(), updated_at = now()
     where youth_id = p_youth;
    return st.stage + 1;
  end if;
  return null;
end $$;

-- 단계를 올릴지는 청년 본인이 정한다
create or replace function respond_stage_proposal(p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() <> 'youth' then raise exception 'youth only'; end if;
  update stage_state
     set stage = case when p_accept then proposed_stage else stage end,
         proposed_stage = null, proposed_at = null, updated_at = now()
   where youth_id = auth.uid() and proposed_stage is not null;
end $$;

-- ───────────────────────── 위기 알림·재전달 ─────────────────────────
create or replace function raise_crisis(p_message uuid, p_severity text, p_excerpt text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  a assignments%rowtype;
  ev uuid;
begin
  if my_role() <> 'youth' then raise exception 'youth only'; end if;
  select * into a from assignments where youth_id = auth.uid();
  insert into crisis_events(youth_id, message_id, severity, excerpt)
    values (auth.uid(), p_message, p_severity, left(p_excerpt, 200))
    returning id into ev;
  insert into alerts(crisis_event_id, youth_id, recipient_id, level)
    values (ev, auth.uid(), a.counselor_id, 'primary');
  -- 생명이 위급한 신호는 기다리지 않고 위기대응팀에도 바로 보낸다
  if p_severity = 'urgent' then
    insert into alerts(crisis_event_id, youth_id, recipient_id, level)
      values (ev, auth.uid(), a.crisis_team_id, 'emergency')
      on conflict do nothing;
  end if;
  return ev;
end $$;

create or replace function ack_alert(p_alert uuid) returns void
language sql security definer set search_path = public as $$
  update alerts set acked_at = now()
   where id = p_alert and recipient_id = auth.uid() and acked_at is null
$$;

-- 확인되지 않은 알림을 다음 단계 담당자에게 넘긴다. 사람이 확인하면 멈춘다.
create or replace function escalate_alerts() returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select al.*, a.backup_id, a.crisis_team_id
      from alerts al join assignments a on a.youth_id = al.youth_id
     where al.acked_at is null
       and al.level in ('primary','backup')
       and al.created_at <= now() - make_interval(secs => cfg('escalation_seconds'))
       and not exists (select 1 from alerts x
                        where x.crisis_event_id = al.crisis_event_id and x.acked_at is not null)
  loop
    insert into alerts(crisis_event_id, youth_id, recipient_id, level)
      values (r.crisis_event_id, r.youth_id,
              case r.level when 'primary' then r.backup_id else r.crisis_team_id end,
              case r.level when 'primary' then 'backup' else 'emergency' end)
      on conflict do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- pg_cron이 켜져 있으면 1분마다 재전달을 돈다. 꺼져 있으면 상담사 화면 폴링이 같은 함수를 부른다.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('escalate_alerts') where exists (select 1 from cron.job where jobname = 'escalate_alerts');
    perform cron.schedule('escalate_alerts', '* * * * *', 'select public.escalate_alerts()');
  end if;
end $$;

-- ───────────────────────── 시연용 데이터 ─────────────────────────
-- p_mode = 'fresh'      : 1단계, 선배의 첫 글만 있는 상태(첫 양방향 대화 → 2단계 시연)
-- p_mode = 'four_weeks' : 2단계, 최근 2주간 주 3회씩 주고받은 상태(단계 제안 시연)
create or replace function seed_youth_state(p_youth uuid, p_mode text) returns void
language plpgsql security definer set search_path = public as $$
declare
  a assignments%rowtype;
  i integer;
  t timestamptz;
begin
  select * into a from assignments where youth_id = p_youth;
  delete from alerts where youth_id = p_youth;
  delete from crisis_events where youth_id = p_youth;
  delete from contacts where youth_id = p_youth;
  delete from messages where youth_id = p_youth;
  delete from reactions where youth_id = p_youth;
  delete from checkins where youth_id = p_youth;
  delete from daily_steps where youth_id = p_youth;
  delete from stage_state where youth_id = p_youth;

  if p_mode = 'four_weeks' then
    insert into stage_state(youth_id, stage) values (p_youth, 2);
    -- 최근 13일 동안 6쌍(주 3회 × 2주)
    for i in 0..5 loop
      t := now() - make_interval(days => 1 + i * 2, hours => 3);
      insert into messages(youth_id, sender_id, body, created_at)
        values (p_youth, a.mentor_id, '오늘은 어떤 걸음을 했어요?', t);
      insert into messages(youth_id, sender_id, body, created_at)
        values (p_youth, p_youth, '창문 열고 사진 찍었어요', t + interval '2 hours');
    end loop;
  else
    insert into stage_state(youth_id, stage) values (p_youth, 1);
    insert into messages(youth_id, sender_id, body, created_at)
      values (p_youth, a.mentor_id,
        '저도 커튼 여는 데 한 달 걸렸어요. 사진은 흐려도 괜찮아요. 오늘 찍은 하늘은 어땠어요?',
        now() - interval '20 hours');
  end if;
end $$;

-- 누른 사람이 속한 데모 세트만 초기화한다
create or replace function reset_my_demo_set(p_mode text) returns void
language plpgsql security definer set search_path = public as $$
declare
  y uuid;
begin
  if my_role() not in ('counselor','mentor') then raise exception 'not allowed'; end if;
  for y in select id from profiles where role = 'youth' and demo_set = my_demo_set() and demo_set > 0
  loop
    perform seed_youth_state(y, p_mode);
  end loop;
end $$;

revoke execute on function seed_youth_state(uuid, text) from public, anon, authenticated;
