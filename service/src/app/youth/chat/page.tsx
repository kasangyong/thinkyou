import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getMe } from "@/lib/supabase/server";
import { kstTime } from "@/lib/format";
import { AppShell, Composer, CrisisSheet, MessageList } from "@/ui/kit";
import { AutoRefresh } from "@/ui/auto-refresh";
import { sendMessage } from "../../actions";

export default async function YouthChat({ searchParams }: PageProps<"/youth/chat">) {
  const me = await getMe();
  if (!me || me.role !== "youth") redirect("/");
  const { crisis } = await searchParams;
  const supabase = await createClient();

  const { data: assignment } = await supabase.from("assignments").select("mentor_id").eq("youth_id", me.id).single();
  const [{ data: mentor }, { data: messages }, { data: stage }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", assignment?.mentor_id ?? "").maybeSingle(),
    supabase.from("messages").select("id, sender_id, body, created_at").eq("youth_id", me.id).order("created_at"),
    supabase.from("stage_state").select("stage").eq("youth_id", me.id).maybeSingle(),
  ]);
  const mentorName = mentor?.display_name ?? "선배";

  return (
    <AppShell
      title={`${mentorName} 님과 주고받기`}
      subtitle={(stage?.stage ?? 0) >= 2 ? "첫 양방향 대화를 나눴어요 · 2단계가 열렸어요" : "선배의 글에 한 줄만 답해도 돼요"}
      right={<Link href="/youth" className="text-xs text-sub underline">홈</Link>}
    >
      <AutoRefresh seconds={10} />
      <MessageList
        emptyText="아직 주고받은 글이 없어요."
        messages={(messages ?? []).map((m) => ({
          id: m.id,
          mine: m.sender_id === me.id,
          senderName: m.sender_id === me.id ? me.display_name : mentorName,
          body: m.body,
          time: kstTime(m.created_at),
        }))}
      />
      <Composer action={sendMessage} placeholder="한 줄만 적어도 괜찮아요" />
      {crisis === "1" && <CrisisSheet closeHref="/youth/chat" />}
    </AppShell>
  );
}
