import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { canUseThread, getMe } from "@/lib/auth";
import { one, rows, sql } from "@/lib/db";
import { kstTime } from "@/lib/format";
import { AppShell, Composer, MessageList } from "@/ui/kit";
import { AutoRefresh } from "@/ui/auto-refresh";
import { sendMessage } from "../../actions";

type Msg = { id: string; sender_id: string; body: string; created_at: string };

export default async function MentorThread({ params }: PageProps<"/mentor/[youthId]">) {
  const me = await getMe();
  if (!me || me.role !== "mentor") redirect("/");
  const { youthId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(youthId) || !(await canUseThread(me, youthId))) notFound();

  const [youth, messages] = await Promise.all([
    one<{ display_name: string }>(sql`select display_name from profiles where id = ${youthId}`),
    rows<Msg>(sql`select id, sender_id, body, created_at from messages where youth_id = ${youthId} order by created_at, id`),
  ]);
  const youthName = youth?.display_name ?? "청년";

  return (
    <AppShell title={`${youthName} 님과 주고받기`} subtitle="조언보다 내 경험 한 줄이 더 닿아요"
      right={<Link href="/mentor" className="text-xs text-sub underline">목록</Link>}>
      <AutoRefresh seconds={10} />
      <MessageList
        emptyText="먼저 짧은 글을 남겨 주세요."
        messages={messages.map((m) => ({
          id: m.id,
          mine: m.sender_id === me.id,
          senderName: m.sender_id === me.id ? me.display_name : youthName,
          body: m.body,
          time: kstTime(m.created_at),
        }))}
      />
      <Composer action={sendMessage} hidden={{ youthId }} placeholder="짧게 답장하기" />
    </AppShell>
  );
}
