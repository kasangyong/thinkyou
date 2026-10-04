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
    rows<Msg & { crisis: boolean }>(sql`
      select m.id, m.sender_id, m.body, m.created_at,
             exists (select 1 from crisis_events e where e.message_id = m.id) as crisis
        from messages m where m.youth_id = ${youthId} order by m.created_at, m.id`),
  ]);
  const youthName = youth?.display_name ?? "청년";

  return (
    <AppShell title={`${youthName} 님과 주고받기`} subtitle="조언보다 내 경험 한 줄이 더 닿아요"
      right={<Link href="/mentor" className="text-xs text-sub underline">목록</Link>}
      dock={<Composer action={sendMessage} hidden={{ youthId }} placeholder="짧게 답장하기" />}>
      <AutoRefresh seconds={10} />
      <MessageList
        emptyText="먼저 짧은 글을 남겨 주세요."
        messages={messages.map((m) => ({
          id: m.id,
          mine: m.sender_id === me.id,
          senderName: m.sender_id === me.id ? me.display_name : youthName,
          body: m.body,
          time: kstTime(m.created_at),
          // 선배가 혼자 감당하지 않도록, 위기 신호가 감지된 글에는 상담사 연계 사실을 알린다
          note: m.crisis ? "위험 신호로 감지되어 담당 상담사에게 알렸어요. 답장은 평소처럼 짧게, 판단은 상담사에게 맡겨 주세요." : undefined,
        }))}
      />
    </AppShell>
  );
}
