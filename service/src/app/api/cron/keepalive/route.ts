import { sql } from "@/lib/db";

// Neon은 쉬고 있다가 첫 요청에 깨어나 느릴 수 있다. 심사 기간에 하루 한 번 미리 깨워 둔다.
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }
  await sql`select 1`;
  return Response.json({ ok: true });
}
