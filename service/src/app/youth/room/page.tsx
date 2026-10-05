import Link from "next/link";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/auth";
import { rows, sql } from "@/lib/db";
import { ensureMigrations } from "@/lib/migrate";
import { AppShell, DemoNotice, ProgramItem, type ProgramView } from "@/ui/kit";

type Row = {
  id: string;
  title: string;
  org: string;
  summary: string;
  min_stage: number;
  until: string;
  starts_on: string;
  fit: boolean;
  status: "draft" | "sent" | null;
};

// 상시 대기실: 단계에 맞는 프로그램 모집 소식을 모아 두고, 지원서 초안은 본인이 고르면 만든다
export default async function Room() {
  const me = await getMe();
  if (!me || me.role !== "youth") redirect("/");
  await ensureMigrations();

  const programs = await rows<Row>(sql`
    select p.id, p.title, p.org, p.summary, p.min_stage,
           to_char(p.recruit_until, 'FMMM. FMDD.') as until,
           to_char(p.starts_on, 'FMMM. FMDD.') as starts_on,
           p.min_stage <= coalesce(s.stage, 0) + 1 as fit,
           a.status
      from programs p
      left join stage_state s on s.youth_id = ${me.id}
      left join applications a on a.program_id = p.id and a.youth_id = ${me.id}
     where p.recruit_until >= current_date
     order by (p.min_stage <= coalesce(s.stage, 0) + 1) desc, p.recruit_until`);
  const views: ProgramView[] = programs.map((p) => ({
    id: p.id,
    title: p.title,
    org: p.org,
    summary: p.summary,
    until: p.until,
    startsOn: p.starts_on,
    minStage: p.min_stage,
    fit: p.fit,
    status: p.status ?? "none",
  }));

  return (
    <AppShell
      title="프로그램 대기실"
      subtitle="지금 단계에 맞는 모집 소식을 모아 둘게요"
      right={<Link href="/youth" className="text-xs text-sub underline">홈</Link>}
    >
      <DemoNotice />
      {views.length === 0 ? (
        <p className="text-sm text-sub">지금 모집 중인 프로그램이 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {views.map((p) => <li key={p.id}><ProgramItem program={p} /></li>)}
        </ul>
      )}
    </AppShell>
  );
}
