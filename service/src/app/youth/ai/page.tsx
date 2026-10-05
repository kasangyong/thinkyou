import Link from "next/link";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/auth";
import { one, rows, sql } from "@/lib/db";
import { kstTime } from "@/lib/format";
import { ensureMigrations } from "@/lib/migrate";
import { weeklyTalk } from "@/lib/ai-chat";
import { AppShell, Composer, CrisisSheet, MessageList, TalkBalance } from "@/ui/kit";
import { sendAi } from "../../actions";

type Msg = { id: string; role: "youth" | "ai"; body: string; created_at: string };

// AI와 이야기하기: 막지 않는다. 대신 단계가 오를수록 AI 답이 짧아지고 선배 쪽으로 이어 준다
export default async function YouthAi({ searchParams }: PageProps<"/youth/ai">) {
  const me = await getMe();
  if (!me || me.role !== "youth") redirect("/");
  await ensureMigrations();
  const { crisis } = await searchParams;

  const [talk, messages, mentor] = await Promise.all([
    weeklyTalk(me.id),
    rows<Msg>(sql`
      select id, role, body, created_at from (
        select id, role, body, created_at from ai_messages where youth_id = ${me.id} order by created_at desc limit 40
      ) t order by created_at`),
    one<{ display_name: string }>(sql`
      select p.display_name from assignments a join profiles p on p.id = a.mentor_id where a.youth_id = ${me.id}`),
  ]);
  const mentorName = mentor?.display_name ?? "선배";

  return (
    <AppShell
      title="AI와 이야기하기"
      subtitle="언제든 말 걸어도 돼요. 단계가 오를수록 AI는 사람에게 이어 줘요"
      right={<Link href="/youth" className="text-xs text-sub underline">홈</Link>}
      dock={
        <div className="flex flex-col gap-2">
          <Composer action={sendAi} placeholder="지금 마음을 한 줄로" />
          <Link href="/youth/chat" className="text-center text-xs text-sub underline">{mentorName} 님에게 직접 말 걸기</Link>
        </div>
      }
    >
      <div className="rounded-2xl bg-ai-soft p-3">
        <p className="mb-2 text-xs font-semibold text-sub">이번 주 내가 말을 건 곳</p>
        <TalkBalance person={talk.person} ai={talk.ai} mentorName={mentorName} />
      </div>
      <MessageList
        emptyText="무슨 이야기든 짧게 적어 보세요. 단계가 오를수록 AI는 선배와 사람에게 이어 줘요."
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
