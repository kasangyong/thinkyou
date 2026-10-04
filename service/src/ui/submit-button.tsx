"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

// 서버 액션 폼의 제출 버튼. 처리 중에는 눌린 버튼에 진행 표시를 띄우고 다시 누를 수 없게 한다.
export function SubmitButton(props: {
  children: ReactNode;
  className: string;
  name?: string;
  value?: string;
  pressed?: boolean;
  pendingLabel?: string;
}) {
  const { pending, data } = useFormStatus();
  const mine = pending && (!props.name || data?.get(props.name) === props.value);
  return (
    <button
      name={props.name}
      value={props.value}
      aria-pressed={props.pressed}
      aria-busy={mine || undefined}
      disabled={pending}
      className={props.className}
    >
      {mine ? (
        <span className="inline-flex items-center justify-center gap-2">
          <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
          {props.pendingLabel ?? "처리 중…"}
        </span>
      ) : (
        props.children
      )}
    </button>
  );
}
