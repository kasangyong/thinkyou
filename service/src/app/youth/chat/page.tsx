import Link from "next/link";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/auth";
import { one, rows, sql } from "@/lib/db";
import { kstTime } from "@/lib/format";
import { AppShell, Composer, CrisisSheet, MessageList } from "@/ui/kit";
import { AutoRefresh } from "@/ui/auto-refresh";
import { sendMessage } from "../../actions";

type Msg = { id: string; sender_id: string; body: string; created_at: string };

export default async function YouthChat({ searchParams }: PageProps<"/youth/chat">) {
  const me = await getMe();
  if (!me || me.role !== "youth") redirect("/");
  const { crisis, draft } = await searchParams;
  // 홈의 "선배에게 한 줄로 알려 보기"에서 넘어오면 입력창에 미리 채워 둔다(보내기는 본인이)
  const draftText = typeof draft === "string" ? draft.slice(0, 200) : undefined;

  const [mentor, messages, stage] = await Promise.all([
    one<{ display_name: string }>(sql`
      select p.display_name from assignments a join profiles p on p.id = a.mentor_id where a.youth_id = ${me.id}`),
    rows<Msg>(sql`select id, sender_id, body, created_at from messages where youth_id = ${me.id} order by created_at, id`),
    one<{ stage: number }>(sql`select stage from stage_state where youth_id = ${me.id}`),
  ]);
  const mentorName = mentor?.display_name ?? "선배";

  return (
    <AppShell
      title={`${mentorName} 님과 주고받기`}
      subtitle={(stage?.stage ?? 0) >= 2 ? `지금 ${stage?.stage}단계 · 주고받은 대화가 쌓이고 있어요` : "선배의 글에 한 줄만 답해도 돼요"}
      right={<Link href="/youth" className="text-xs text-sub underline">홈</Link>}
      dock={<Composer action={sendMessage} placeholder="한 줄만 적어도 괜찮아요" defaultValue={draftText} />}
    >
      <AutoRefresh seconds={10} />
      <MessageList
        emptyText="아직 주고받은 글이 없어요."
        messages={messages.map((m) => ({
          id: m.id,
          mine: m.sender_id === me.id,
          senderName: m.sender_id === me.id ? me.display_name : mentorName,
          body: m.body,
          time: kstTime(m.created_at),
        }))}
      />
            {crisis === "1" && <CrisisSheet closeHref="/youth/chat" />}
    </AppShell>
  );
}
