import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient, getMe } from "@/lib/supabase/server";
import { kstTime } from "@/lib/format";
import { AppShell, Composer, MessageList } from "@/ui/kit";
import { AutoRefresh } from "@/ui/auto-refresh";
import { sendMessage } from "../../actions";

export default async function MentorThread({ params }: PageProps<"/mentor/[youthId]">) {
  const me = await getMe();
  if (!me || me.role !== "mentor") redirect("/");
  const { youthId } = await params;
  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("assignments").select("youth_id").eq("youth_id", youthId).eq("mentor_id", me.id).maybeSingle();
  if (!assignment) notFound();

  const [{ data: youth }, { data: messages }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", youthId).single(),
    supabase.from("messages").select("id, sender_id, body, created_at").eq("youth_id", youthId).order("created_at"),
  ]);
  const youthName = youth?.display_name ?? "청년";

  return (
    <AppShell title={`${youthName} 님과 주고받기`} subtitle="조언보다 내 경험 한 줄이 더 닿아요"
      right={<Link href="/mentor" className="text-xs text-sub underline">목록</Link>}>
      <AutoRefresh seconds={10} />
      <MessageList
        emptyText="먼저 짧은 글을 남겨 주세요."
        messages={(messages ?? []).map((m) => ({
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
