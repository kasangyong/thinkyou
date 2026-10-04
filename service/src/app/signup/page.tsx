import Link from "next/link";
import { AppShell } from "@/ui/kit";
import { AuthForm } from "../login/auth-form";
import { signup } from "../actions";

export default function SignupPage() {
  return (
    <AppShell title="가입하기" subtitle="시연 기간에는 초대 코드가 있어야 가입할 수 있어요">
      <AuthForm action={signup} submitLabel="가입하고 시작하기" fields={[
        { name: "code", label: "초대 코드", type: "text" },
        { name: "name", label: "불릴 이름", type: "text" },
        { name: "email", label: "이메일", type: "email" },
        { name: "password", label: "비밀번호 (8자 이상)", type: "password" },
      ]} />
      <p className="text-xs leading-relaxed text-sub">
        가입하면 위험 신호가 감지될 때 공유 설정과 관계없이 담당 상담사에게 알림이 간다는 원칙에 동의하게 됩니다.
      </p>
      <p className="text-center text-sm text-sub"><Link href="/login" className="underline">로그인으로 돌아가기</Link></p>
    </AppShell>
  );
}
