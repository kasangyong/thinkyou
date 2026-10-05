import { geminiHealth } from "@/lib/gemini";

// 로그인 없이 Gemini 연결 상태만 알려 준다. 키나 응답 내용은 돌려주지 않는다
export async function GET() {
  return Response.json(await geminiHealth());
}
