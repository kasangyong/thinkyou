import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // 서버 컴포넌트 렌더링 중에는 쿠키를 쓸 수 없다. 세션 갱신은 proxy가 맡는다.
          }
        },
      },
    },
  );
}

// 서비스 롤 클라이언트: RLS를 우회하므로 회원가입처럼 서버에서만, 꼭 필요한 곳에만 쓴다.
export function createServiceClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export type Role = "youth" | "mentor" | "counselor" | "backup" | "crisis_team";

export type Me = {
  id: string;
  role: Role;
  display_name: string;
  demo_set: number;
};

export async function getMe(): Promise<Me | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, role, display_name, demo_set")
    .eq("id", auth.user.id)
    .single();
  return (data as Me) ?? null;
}
