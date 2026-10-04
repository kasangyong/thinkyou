import { createServiceClient } from "@/lib/supabase/server";

// Supabase 무료 프로젝트는 7일 동안 요청이 없으면 일시정지된다. Vercel Cron이 하루 한 번 깨운다.
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const { error } = await createServiceClient().from("app_config").select("key").limit(1);
  return Response.json({ ok: !error });
}
