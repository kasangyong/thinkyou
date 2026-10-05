import Link from "next/link";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/auth";
import { one, rows, sql } from "@/lib/db";
import { kstTime } from "@/lib/format";
import { ensureMigrations } from "@/lib/migrate";
import { aiLimit, aiUsedToday } from "@/lib/ai-chat";
import { AppShell, Composer, CrisisSheet, MessageList, NavLink } from "@/ui/kit";
import { sendAi } from "../../actions";

type Msg = { id: string; role: "youth" | "ai"; body: string; created_at: string };

// AI와 이야기하기: 단계가 오를수록 하루 횟수가 줄고, 다 쓰면 선배에게로 안내한다
export default async function YouthAi({ searchParams }: PageProps<"/youth/ai">) {
  const me = await getMe();
  if (!me || me.role !== "youth") redirect("/");
  await ensureMigrations();
  const { crisis } = await searchParams;

  const [st, used, messages, mentor] = await Promise.all([
    one<{ stage: number }>(sql`select stage from stage_state where youth_id = ${me.id}`),
    aiUsedToday(me.id),
    rows<Msg>(sql`
      select id, role, body, created_at from (
        select id, role, body, created_at from ai_messages where youth_id = ${me.id} order by created_at desc limit 40
      ) t order by created_at`),
    one<{ display_name: string }>(sql`
      select p.display_name from assignments a join profiles p on p.id = a.mentor_id where a.youth_id = ${me.id}`),
  ]);
  const stage = st?.stage ?? 0;
  const limit = aiLimit(stage);
  const remaining = Math.max(limit - used, 0);
  const mentorName = mentor?.display_name ?? "선배";

  return (
    <AppShell
      title="AI와 이야기하기"
      subtitle={`오늘 ${remaining}번 남았어요 · ${stage}단계는 하루 ${limit}번`}
      right={<Link href="/youth" className="text-xs text-sub underline">홈</Link>}
      dock={
        remaining > 0 ? (
          <Composer action={sendAi} placeholder="지금 마음을 한 줄로" />
        ) : (
          <div className="flex flex-col gap-2 py-1">
            <p className="text-center text-xs text-sub">오늘 AI와 나눌 이야기는 다 했어요. 나머지는 사람에게 해 봐요.</p>
            <NavLink href="/youth/chat">{mentorName} 님과 주고받기</NavLink>
          </div>
        )
      }
    >
      <MessageList
        emptyText="무슨 이야기든 짧게 적어 보세요. 단계가 오를수록 AI 대신 선배와 더 많이 이야기하게 돼요."
        messages={messages.map((m) => ({
          id: m.id,
          mine: m.role === "youth",
          senderName: m.role === "youth" ? me.display_name : "AI",
          body: m.body,
          time: kstTime(m.created_at),
        }))}
      />
      {crisis === "1" && <CrisisSheet closeHref="/youth/ai" />}
    </AppShell>
  );
}
