"use client";

import { useActionState } from "react";
import type { FormState } from "../actions";

type Field = { name: string; label: string; type: string };

export function AuthForm(props: {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  fields: Field[];
  submitLabel: string;
}) {
  const [state, action, pending] = useActionState(props.action, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      {props.fields.map((f) => (
        <label key={f.name} className="flex flex-col gap-1 text-sm">
          {f.label}
          <input name={f.name} type={f.type} required className="rounded-xl border border-line bg-white px-3 py-3" />
        </label>
      ))}
      {state?.error && <p role="alert" className="text-sm text-alert">{state.error}</p>}
      <button disabled={pending} className="rounded-xl bg-ink py-3 text-sm font-semibold text-white disabled:opacity-60">
        {pending ? "확인하는 중…" : props.submitLabel}
      </button>
    </form>
  );
}
