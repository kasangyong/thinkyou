import Link from "next/link";
import { AppShell, Card, Label } from "@/ui/kit";
import { AuthForm } from "./auth-form";
import { login } from "../actions";

const DEMO = [
  ["청년", "youth1@demo.oneul"],
  ["회복 선배", "mentor1@demo.oneul"],
  ["담당 상담사", "counselor1@demo.oneul"],
  ["예비 담당자", "backup@demo.oneul"],
  ["위기대응팀(시뮬레이션)", "crisis@demo.oneul"],
];

export default function LoginPage() {
  return (
    <AppShell title="오늘한걸음" subtitle="AI가 붙잡지 않고, 사람에게 돌려보냅니다">
      <AuthForm action={login} submitLabel="로그인" fields={[
        { name: "email", label: "이메일", type: "email" },
        { name: "password", label: "비밀번호", type: "password" },
      ]} />
      <Card>
        <Label>시연용 데모 계정</Label>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {DEMO.map(([role, email]) => (
            <li key={email} className="flex justify-between gap-2"><span className="text-sub">{role}</span><span className="font-mono text-xs">{email}</span></li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-sub">숫자를 2, 3으로 바꾸면 다른 세트입니다. 비밀번호는 제출 자료에 적어 두었습니다.</p>
      </Card>
      <p className="text-center text-sm text-sub">초대 코드가 있나요? <Link href="/signup" className="underline">가입하기</Link></p>
    </AppShell>
  );
}
