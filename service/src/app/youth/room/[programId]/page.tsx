import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getMe } from "@/lib/auth";
import { one, sql } from "@/lib/db";
import { ensureMigrations } from "@/lib/migrate";
import { AppShell, Card, DemoNotice, GhostButton, Label, PrimaryButton } from "@/ui/kit";
import { makeDraft, sendApplication } from "../../../actions";

type Program = { id: string; title: string; org: string; summary: string; until: string; starts_on: string; fit: boolean; min_stage: number };

export default async function ProgramPage({ params }: PageProps<"/youth/room/[programId]">) {
  const me = await getMe();
  if (!me || me.role !== "youth") redirect("/");
  await ensureMigrations();
  const { programId } = await params;

  const [program, app] = await Promise.all([
    one<Program>(sql`
      select p.id, p.title, p.org, p.summary, p.min_stage,
             to_char(p.recruit_until, 'FMMM. FMDD.') as until,
             to_char(p.starts_on, 'FMMM. FMDD.') as starts_on,
             p.min_stage <= coalesce((select stage from stage_state where youth_id = ${me.id}), 0) + 1 as fit
        from programs p where p.id = ${programId} and p.recruit_until >= current_date`),
    one<{ draft: string; status: "draft" | "sent" }>(sql`
      select draft, status from applications where youth_id = ${me.id} and program_id = ${programId}`),
  ]);
  if (!program) notFound();

  return (
    <AppShell
      title={program.title}
      subtitle={`${program.org} · 모집 ${program.until}까지 · ${program.starts_on} 시작`}
      right={<Link href="/youth/room" className="text-xs text-sub underline">대기실</Link>}
    >
      <DemoNotice />
      <Card>
        <p className="text-sm text-ink">{program.summary}</p>
      </Card>

      {app?.status === "sent" ? (
        <Card tone="person">
          <Label>보낸 지원서</Label>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">{app.draft}</p>
          <p className="mt-3 text-xs text-sub">담당 상담사가 확인하고 기관에 전해요. 시연에서는 실제로 전달되지 않아요.</p>
        </Card>
      ) : !program.fit ? (
        <Card><p className="text-sm text-sub">{program.min_stage}단계부터 지원할 수 있어요. 지금 걸음을 이어 가다 보면 열려요.</p></Card>
      ) : app ? (
        <Card tone="ai">
          <Label>지원서 초안 · 고쳐서 보내도 돼요</Label>
          <form action={sendApplication} className="mt-2 flex flex-col gap-2">
            <input type="hidden" name="programId" value={program.id} />
            <textarea
              name="draft"
              defaultValue={app.draft}
              required
              maxLength={1500}
              rows={9}
              aria-label="지원서 내용"
              className="w-full rounded-xl border border-line bg-white p-3 text-sm leading-relaxed text-ink"
            />
            <PrimaryButton>이 내용으로 보내기</PrimaryButton>
          </form>
          <form action={makeDraft} className="mt-1">
            <input type="hidden" name="programId" value={program.id} />
            <GhostButton>초안 다시 만들기 (고친 내용은 사라져요)</GhostButton>
          </form>
          <p className="mt-1 text-xs text-sub">보내기 전에는 아무에게도 가지 않아요.</p>
        </Card>
      ) : (
        <Card tone="ai">
          <Label>지원서 초안 만들기</Label>
          <p className="mb-3 mt-1 text-sm text-ink">
            최근 완료한 걸음과 선배와 주고받은 횟수로 초안을 써 드려요. 대화 내용은 쓰지 않고, 보낼지는 직접 정해요.
          </p>
          <form action={makeDraft}>
            <input type="hidden" name="programId" value={program.id} />
            <PrimaryButton>초안 만들기</PrimaryButton>
          </form>
        </Card>
      )}
    </AppShell>
  );
}
