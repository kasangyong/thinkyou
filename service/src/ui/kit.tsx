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

export type StepFeedback = "easy" | "right" | "hard";

export function StepCard(props: {
  text: string;
  done: boolean;
  doneAction: () => Promise<void>;
  smallerAction: () => Promise<void>;
  feedback: StepFeedback | null;
  feedbackAction: (fd: FormData) => Promise<void>;
  // 걸음을 마치면 선배에게 한 줄로 알릴 수 있게 대화창으로 이어 준다(인증이 아니라 대화의 계기)
  shareHref: string;
  mentorName: string;
  weekDone: number;
}) {
  const choices: [StepFeedback, string][] = [["easy", "쉬웠어요"], ["right", "딱 좋았어요"], ["hard", "버거웠어요"]];
  return (
    <Card>
      <div className="flex items-center justify-between">
        <Label>오늘의 한 걸음</Label>
        <span className="text-xs text-sub">이번 주 {props.weekDone}걸음</span>
      </div>
      <p className="mb-3 mt-2 font-display text-xl leading-snug text-ink">{props.text}</p>
      {props.done ? (
        <div className="flex flex-col gap-3">
          <p className="rounded-xl bg-person-soft px-4 py-3 text-center text-sm font-semibold text-ink">오늘 걸음을 마쳤어요</p>
          {props.feedback === null ? (
            <form action={props.feedbackAction} aria-label="오늘 걸음은 어땠어요?">
              <p className="mb-2 text-xs text-sub">어땠어요? 내일 걸음 크기에 반영할게요</p>
              <div className="grid grid-cols-3 gap-2">
                {choices.map(([v, label]) => (
                  <SubmitButton key={v} name="feedback" value={v} pendingLabel="저장 중"
                    className="rounded-xl border border-line bg-white py-2.5 text-sm text-ink">
                    {label}
                  </SubmitButton>
                ))}
              </div>
            </form>
          ) : (
            <p className="text-center text-xs text-sub">
              {props.feedback === "hard" ? "내일은 더 작은 걸음으로 준비할게요" : props.feedback === "easy" ? "내일은 한 뼘만 더 가 볼게요" : "내일도 이만큼이면 충분해요"}
            </p>
          )}
          <Link href={props.shareHref} className="block rounded-xl bg-person px-4 py-3 text-center text-sm font-semibold text-ink">
            {props.mentorName} 님에게 한 줄로 알려 보기
          </Link>
        </div>
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

export function Composer(props: { action: (fd: FormData) => Promise<void>; hidden?: Record<string, string>; placeholder: string; defaultValue?: string }) {
  return (
    <form action={props.action} className="flex gap-2">
      {Object.entries(props.hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label className="sr-only" htmlFor="body">메시지</label>
      <input id="body" name="body" required maxLength={1000} placeholder={props.placeholder} autoComplete="off" defaultValue={props.defaultValue}
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
  youthHref?: string;
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
      <p className="mt-2 text-sm font-semibold text-ink">
        {a.youthName}
        {a.youthHref && <Link href={a.youthHref} className="ml-2 text-xs font-normal text-sub underline">청년 기록 보기</Link>}
      </p>
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

// awayDays: 재연결 약속 기간을 넘겨 소식이 없는 날 수(없으면 undefined)
export type YouthRow = { id: string; name: string; stage: number; proposed: number | null; contacts14d: number; href?: string; awayDays?: number };

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
            {r.awayDays !== undefined && (
              <span className="mt-1 rounded-lg bg-person-soft px-2 py-1 text-xs font-semibold text-ink">
                약속한 재연결 · {r.awayDays}일째 소식 없음 · 먼저 짧게 연락해 주세요
              </span>
            )}
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

// ───────── 상시 대기실 ─────────
export function DemoNotice() {
  return <p className="rounded-xl bg-white px-3 py-2 text-xs text-sub ring-1 ring-line">시연용 예시 공고예요. 실제 기관에 전달되지 않아요.</p>;
}

export function RoomLink(props: { fitCount: number }) {
  return (
    <Link href="/youth/room" className="flex items-center justify-between rounded-2xl border border-line bg-white p-4">
      <span>
        <span className="block text-sm font-semibold text-ink">프로그램 대기실</span>
        <span className="text-xs text-sub">
          {props.fitCount ? `지금 단계에 맞는 모집 ${props.fitCount}건` : "지금 단계에 맞는 모집은 아직 없어요"}
        </span>
      </span>
      <span aria-hidden="true" className="text-sub">›</span>
    </Link>
  );
}

export type ProgramView = {
  id: string;
  title: string;
  org: string;
  summary: string;
  until: string;
  startsOn: string;
  minStage: number;
  fit: boolean;
  status: "none" | "draft" | "sent";
};

const APP_STATUS = { none: "", draft: "초안 있음", sent: "보냄" } as const;

export function ProgramItem(props: { program: ProgramView }) {
  const p = props.program;
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="font-semibold text-ink">{p.title}</span>
        {p.status !== "none" && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${p.status === "sent" ? "bg-ink text-white" : "bg-ai-soft text-ink"}`}>
            {APP_STATUS[p.status]}
          </span>
        )}
      </span>
      <span className="text-xs text-sub">{p.org} · 모집 {p.until}까지 · {p.startsOn} 시작</span>
      <span className="text-sm text-ink">{p.summary}</span>
      {!p.fit && p.status === "none" && <span className="text-xs text-sub">{p.minStage}단계부터 지원할 수 있어요</span>}
    </>
  );
  return p.fit || p.status !== "none" ? (
    <Link href={`/youth/room/${p.id}`} className="flex flex-col gap-1 rounded-2xl border border-line bg-white p-4">{body}</Link>
  ) : (
    <div className="flex flex-col gap-1 rounded-2xl border border-line bg-white/60 p-4 opacity-60">{body}</div>
  );
}

// ───────── 재연결 약속 ─────────
export function PromiseCard(props: {
  afterDays: number | null;
  mentorName: string;
  setAction: (fd: FormData) => Promise<void>;
  dropAction: () => Promise<void>;
}) {
  if (props.afterDays) {
    return (
      <Card>
        <Label>재연결 약속</Label>
        <p className="mt-1 text-sm text-ink">
          {props.afterDays === 14 ? "2주" : "한 달"} 동안 소식이 없으면 {props.mentorName} 님과 담당 상담사가 먼저 연락하고,
          다시 들어왔을 때 돌아올 문을 보여 드려요.
        </p>
        <form action={props.dropAction} className="mt-2"><GhostButton>약속 거두기</GhostButton></form>
      </Card>
    );
  }
  return (
    <Card>
      <Label>재연결 약속</Label>
      <p className="mb-3 mt-1 text-sm text-ink">한동안 못 들어와도 괜찮아요. 연락이 끊기면 언제 먼저 연락할까요?</p>
      <form action={props.setAction} className="grid grid-cols-2 gap-2">
        <SubmitButton name="days" value="14" className="rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-ink">2주 뒤</SubmitButton>
        <SubmitButton name="days" value="30" className="rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-ink">한 달 뒤</SubmitButton>
      </form>
      <p className="mt-2 text-xs text-sub">약속하지 않아도 앱은 그대로 쓸 수 있어요. 언제든 거둘 수 있어요.</p>
    </Card>
  );
}

// 약속한 기간을 넘겨 돌아왔을 때 맨 위에 보이는 카드: 담당자, 다음 모집, 다시 시작할 단계
export function DoorCard(props: {
  days: number;
  mentorName: string | null;
  counselorName: string | null;
  nextProgram: { title: string; until: string } | null;
  stage: number;
  action: (fd: FormData) => Promise<void>;
}) {
  const canLower = props.stage > 1;
  const people = [props.mentorName && `${props.mentorName} 선배`, props.counselorName].filter(Boolean).join(" · ");
  return (
    <Card tone="ai">
      <Label>돌아올 문</Label>
      <p className="mt-1 font-display text-lg text-ink">{props.days}일 만이에요. 다시 와 줘서 반가워요.</p>
      <ul className="mt-3 flex flex-col gap-2 text-sm text-ink">
        <li className="rounded-xl bg-white/70 px-3 py-2">
          <span className="block text-xs text-sub">담당자</span>
          {people || "담당자를 연결하고 있어요."}{" "}
          <Link href="/youth/chat" className="font-semibold underline">선배에게 한 줄 남기기</Link>
        </li>
        <li className="rounded-xl bg-white/70 px-3 py-2">
          <span className="block text-xs text-sub">다음 모집</span>
          {props.nextProgram ? (
            <>
              {props.nextProgram.title} · {props.nextProgram.until}까지.{" "}
              <Link href="/youth/room" className="font-semibold underline">대기실 보기</Link>
            </>
          ) : (
            "지금 단계에 맞는 모집은 아직 없어요"
          )}
        </li>
        <li className="rounded-xl bg-white/70 px-3 py-2">
          <span className="block text-xs text-sub">다시 시작할 단계</span>
          {canLower ? `${props.stage}단계 그대로 가도 되고, ${props.stage - 1}단계로 한 칸 내려와 시작해도 돼요.` : `${props.stage}단계에서 다시 시작해요.`}
        </li>
      </ul>
      <form action={props.action} className={`mt-3 grid gap-2 ${canLower ? "grid-cols-2" : ""}`}>
        <PrimaryButton name="lower" value="no">{canLower ? `${props.stage}단계로 시작` : "다시 시작하기"}</PrimaryButton>
        {canLower && (
          <SubmitButton name="lower" value="yes" className="rounded-xl bg-white px-4 py-3 text-sm text-ink">
            {props.stage - 1}단계로 시작
          </SubmitButton>
        )}
      </form>
    </Card>
  );
}

// ───────── AI와 이야기하기 ─────────
export function AiLink(props: { remaining: number; limit: number }) {
  return (
    <Link href="/youth/ai" className="flex items-center justify-between rounded-2xl bg-ai-soft p-4">
      <span>
        <span className="block text-sm font-semibold text-ink">AI와 이야기하기</span>
        <span className="text-xs text-sub">오늘 {props.remaining}번 남았어요 · 단계가 오를수록 줄어들어요</span>
      </span>
      <span aria-hidden="true" className="flex gap-1">
        {Array.from({ length: props.limit }, (_, i) => (
          <span key={i} className={`inline-block size-2 rounded-full ${i < props.remaining ? "bg-ai" : "bg-white"}`} />
        ))}
      </span>
    </Link>
  );
}
