import { NextResponse, type NextRequest } from "next/server";

// 세션 쿠키가 없으면 로그인 화면으로 보낸다(빠른 1차 확인).
// 쿠키 서명 검증과 역할 확인은 각 페이지·서버 액션의 getMe()/requireRole()이 한다.
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = path === "/login" || path === "/signup" || path.startsWith("/api/cron") || path === "/api/health/gemini";
  if (!isPublic && !request.cookies.has("oneul_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)$).*)"],
};
