// 화면 컴포넌트 모음. 디자인(Codex)은 이 파일의 마크업·스타일만 바꾸고,
// 내보내는 이름과 props 타입은 바꾸지 않는다. 데이터·로직은 app/ 아래 페이지가 맡는다.
import Link from "next/link";
import type { ReactNode } from "react";
import { CrisisDialog } from "./CrisisDialog";
import { SubmitButton } from "./submit-button";
import { ScrollToEnd } from "./scroll-to-end";

// ───────── 공통 ─────────
// dock: 화면 아래에 붙는 입력창 등. 안전 안내와 한 덩어리로 붙어 서로 가리지 않는다.
export function AppShell(props: { title: string; subtitle?: string; right?: ReactNode; children: ReactNode; dock?: ReactNode }) {
  return (
    <div className="app-shell mx-auto flex min-h-dvh w-full max-w-md flex-col bg-paper">
      <header className="app-header flex items-end justify-between gap-4 px-5 pb-5 pt-7">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-bold text-ink">{props.title}</h1>
          {props.subtitle && <p className="mt-1 text-sm text-sub">{props.subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-3"><span className="ai-orb ai-orb-header" aria-hidden="true" />{props.right}</div>
      </header>
      <main className="flex flex-1 flex-col gap-4 px-5 pb-6 pt-1">{props.children}</main>
      <div className="sticky bottom-0 z-20">
        {props.dock && <div className="border-t border-line bg-paper/95 px-5 py-2 backdrop-blur">{props.dock}</div>}
        <SafetyFooter />
      </div>
    </div>
  );
}

// 모든 화면에 고정: 시연용 서비스이며 실제 위기라면 109
export function SafetyFooter() {
  return (
    <footer className="border-t border-line bg-white/95 px-5 py-2.5 text-xs leading-relaxed text-sub backdrop-blur">
      시연용 서비스예요. 지금 위험하다면 <a className="font-semibold text-alert underline" href="tel:109">109</a>(24시간 자살예방상담)에 전화하세요.
    </footer>
  );
}

export function Card(props: { children: ReactNode; tone?: "plain" | "person" | "ai" }) {
  const tone =
    props.tone === "person" ? "bg-person-soft border-transparent" : props.tone === "ai" ? "bg-ai-soft border-transparent" : "bg-white border-line";
  return <section className={`surface-card rounded-2xl border p-4 ${tone}`}>{props.children}</section>;
}

export function Label(props: { children: ReactNode }) {
  return <p className="text-xs font-semibold text-sub">{props.children}</p>;
}

export function PrimaryButton(props: { children: ReactNode; name?: string; value?: string; tone?: "ink" | "person" }) {
  const tone = props.tone === "person" ? "bg-person text-ink" : "bg-ink text-white";
  return (
    <SubmitButton name={props.name} value={props.value} className={`w-full rounded-xl px-4 py-3 text-sm font-semibold ${tone} focus-visible:outline-3 focus-visible:outline-dusk`}>
      {props.children}
    </SubmitButton>
  );
}

export function GhostButton(props: { children: ReactNode; name?: string; value?: string }) {
  return (
    <SubmitButton name={props.name} value={props.value} className="w-full rounded-xl px-4 py-2 text-sm text-sub hover:text-ink">
      {props.children}
    </SubmitButton>
  );
}

export function NavLink(props: { href: string; children: ReactNode }) {
  return (
    <Link href={props.href} className="block rounded-xl bg-ink px-4 py-3 text-center text-sm font-semibold text-white">
      {props.children}
    </Link>
  );
}

// ───────── 청년 홈 ─────────
export type MoodValue = "hard" | "ok" | "good";

export function MoodPicker(props: { action: (fd: FormData) => Promise<void>; selected?: MoodValue }) {
  const moods: [MoodValue, string][] = [["hard", "힘듦"], ["ok", "보통"], ["good", "괜찮음"]];
  return (
    <form action={props.action} className="grid grid-cols-3 gap-2" aria-label="오늘 컨디션">
      {moods.map(([v, label]) => (
        <SubmitButton
          key={v}
          name="mood"
          value={v}
          pressed={props.selected === v}
          pendingLabel="걸음 고르는 중"
          className="rounded-xl border border-line bg-white py-3 text-sm aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-white aria-busy:border-ink aria-busy:bg-ink aria-busy:text-white"
        >
          {label}
        </SubmitButton>
      ))}
    </form>
  );
}

export function StepCard(props: {
  text: string;
  done: boolean;
  doneAction: () => Promise<void>;
  smallerAction: () => Promise<void>;
}) {
  return (
    <Card>
      <Label>오늘의 한 걸음</Label>
      <p className="mb-3 mt-2 font-display text-xl leading-snug text-ink">{props.text}</p>
      {props.done ? (
        <p className="rounded-xl bg-person-soft px-4 py-3 text-center text-sm font-semibold text-ink">오늘 걸음을 마쳤어요</p>
      ) : (
        <>
          <form action={props.doneAction}><PrimaryButton>했어요</PrimaryButton></form>
          <form action={props.smallerAction}><GhostButton>더 작은 걸음으로 바꾸기</GhostButton></form>
        </>
      )}
    </Card>
  );
}

const STAGES = ["AI와 이야기하기", "선배의 글 읽기", "선배와 글 주고받기", "음성 · 2~3인 온라인 모임", "밖에서 만나기 · 기관 프로그램"];

export function StageLadder(props: { stage: number }) {
  return (
    <ol className="stage-ladder flex flex-col-reverse gap-1.5" aria-label="회복 단계">
      {STAGES.map((name, i) => (
        <li
          key={i}
          aria-current={i === props.stage ? "step" : undefined}
          className={`stage-rung flex items-center gap-3 rounded-xl border px-3 py-2 text-sm ${
            i === props.stage ? "stage-rung-current border-ink bg-ink text-white" : i < props.stage ? "border-line bg-white text-ink" : "border-line bg-white text-sub"
          }`}
        >
          <span className="w-4 shrink-0 text-center font-bold">{i}</span>
          <span className="min-w-0 flex-1">{name}</span>
          <span className={`ai-orb stage-orb stage-orb-${i}`} aria-hidden="true" />
        </li>
      ))}
    </ol>
  );
}

export function ContactWeeks(props: { lastWeek: number; thisWeek: number; target: number; reactions: number }) {
  const dots = (n: number) =>
    Array.from({ length: Math.max(props.target, n) }, (_, i) => (
      <span key={i} className={`inline-block size-3.5 rounded-full ${i < n ? "bg-person" : "border-[1.5px] border-line"}`} />
    ));
  return (
    <Card>
      <Label>양방향 접촉 · 주 {props.target}회 목표</Label>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-sub">
        지난주 {dots(props.lastWeek)} <span className="w-2" /> 이번 주 {dots(props.thisWeek)}
      </div>
      <p className="mt-2 text-xs text-sub">읽기·이모지 같은 반응 {props.reactions}회는 참고로만 셉니다.</p>
    </Card>
  );
}

export function StageProposal(props: { proposed: number; action: (fd: FormData) => Promise<void> }) {
  return (
    <Card tone="person">
      <Label>2주 연속 목표를 채웠어요</Label>
      <p className="mb-3 mt-1 font-display text-lg text-ink">{STAGES[props.proposed]} 단계로 가 볼까요?</p>
      <form action={props.action} className="grid grid-cols-2 gap-2">
        <PrimaryButton name="accept" value="yes" tone="person">해 볼게요</PrimaryButton>
        <SubmitButton name="accept" value="no" className="rounded-xl bg-white px-4 py-3 text-sm text-sub">다음에</SubmitButton>
      </form>
    </Card>
  );
}

// ───────── 대화 ─────────
export type ChatMessage = { id: string; mine: boolean; senderName: string; body: string; time: string; note?: string };

export function MessageList(props: { messages: ChatMessage[]; emptyText: string }) {
  if (props.messages.length === 0) return <p className="py-8 text-center text-sm text-sub">{props.emptyText}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {props.messages.map((m) => (
        <li key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.mine ? "self-end bg-ink text-white" : "self-start bg-person-soft text-ink"}`}>
          {!m.mine && <p className="mb-0.5 text-xs font-semibold">{m.senderName}</p>}
          <p className="whitespace-pre-wrap">{m.body}</p>
          <p className={`mt-1 text-[11px] ${m.mine ? "text-white/60" : "text-sub"}`}>{m.time}</p>
          {m.note && <p className="mt-2 rounded-lg bg-alert-soft px-2 py-1.5 text-xs font-semibold text-alert">{m.note}</p>}
        </li>
      ))}
      <ScrollToEnd count={props.messages.length} />
    </ul>
  );
}

export function Composer(props: { action: (fd: FormData) => Promise<void>; hidden?: Record<string, string>; placeholder: string }) {
  return (
    <form action={props.action} className="flex gap-2">
      {Object.entries(props.hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label className="sr-only" htmlFor="body">메시지</label>
      <input id="body" name="body" required maxLength={1000} placeholder={props.placeholder} autoComplete="off"
        className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-3 text-sm" />
      <SubmitButton pendingLabel="보내는 중" className="shrink-0 rounded-xl bg-ink px-4 text-sm font-semibold text-white">보내기</SubmitButton>
    </form>
  );
}

// 위험 표현이 감지되면 대화를 이어 가지 않고 사람에게 연결한다
export function CrisisSheet(props: { closeHref: string }) {
  return (
    <CrisisDialog closeHref={props.closeHref}>
      <div className="mx-auto max-h-dvh w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl">
        <h2 id="crisis-title" className="font-display text-xl text-ink">지금은 사람과 이야기해요</h2>
        <a href="tel:109" className="mt-4 flex items-center justify-between rounded-2xl bg-alert px-4 py-3 font-semibold text-white">
          <span>109 자살예방상담<span className="block text-xs font-normal opacity-90">24시간 · 무료 · 익명 가능</span></span>
          <span>전화</span>
        </a>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <a href="tel:119" className="rounded-2xl bg-alert-soft px-4 py-3 text-center font-semibold text-alert">119</a>
          <a href="tel:112" className="rounded-2xl bg-alert-soft px-4 py-3 text-center font-semibold text-alert">112</a>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-sub">
          위험 신호는 공유 설정과 관계없이 담당 상담사에게도 전해집니다. 가입할 때 안내한 원칙이에요.
        </p>
        <Link href={props.closeHref} className="mt-3 block text-center text-sm text-sub underline">닫기</Link>
      </div>
    </CrisisDialog>
  );
}

// ───────── 돌봄 대시보드 ─────────
export type AlertView = {
  id: string;
  level: "primary" | "backup" | "emergency";
  youthName: string;
  excerpt: string;
  severity: "high" | "urgent";
  createdAt: string;
  acked: boolean;
  handledElsewhere?: boolean;
};

const LEVEL_KO = { primary: "담당 상담사", backup: "예비 담당자(재전달)", emergency: "24시간 위기대응팀(시뮬레이션)" };

export function AlertItem(props: { alert: AlertView; ackAction: (fd: FormData) => Promise<void> }) {
  const a = props.alert;
  return (
    <Card tone={a.acked || a.handledElsewhere ? "plain" : "person"}>
      <div className="flex items-center justify-between text-xs">
        <span className={`rounded-full px-2 py-0.5 font-semibold ${a.severity === "urgent" ? "bg-alert text-white" : "bg-alert-soft text-alert"}`}>
          {a.severity === "urgent" ? "긴급" : "주의"}
        </span>
        <span className="text-sub">{LEVEL_KO[a.level]} · {a.createdAt}</span>
      </div>
      <p className="mt-2 text-sm font-semibold text-ink">{a.youthName}</p>
      <p className="mt-1 text-sm text-ink">“{a.excerpt}”</p>
      {a.acked ? (
        <p className="mt-2 text-xs text-sub">확인함</p>
      ) : a.handledElsewhere ? (
        <p className="mt-2 text-xs text-sub">다른 담당자가 확인했어요</p>
      ) : (
        <form action={props.ackAction} className="mt-3">
          <input type="hidden" name="alertId" value={a.id} />
          <PrimaryButton>확인했어요 · 연락 시작</PrimaryButton>
        </form>
      )}
    </Card>
  );
}

export type YouthRow = { id: string; name: string; stage: number; proposed: number | null; contacts14d: number; href?: string };

export function YouthTable(props: { rows: YouthRow[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {props.rows.map((r) => {
        const body = (
          <>
            <span className="font-semibold text-ink">{r.name}</span>
            <span className="text-xs text-sub">
              {r.stage}단계{r.proposed !== null ? ` → ${r.proposed}단계 제안 중` : ""} · 최근 2주 접촉 {r.contacts14d}회
            </span>
          </>
        );
        return (
          <li key={r.id}>
            {r.href ? (
              <Link href={r.href} className="flex flex-col gap-1 rounded-2xl border border-line bg-white p-4">{body}</Link>
            ) : (
              <div className="flex flex-col gap-1 rounded-2xl border border-line bg-white p-4">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
