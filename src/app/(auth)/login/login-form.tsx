"use client";

import { useActionState } from "react";
import { login } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="mt-8 flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state?.fields?.email} autoFocus className="h-10" />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-10" />
      </Field>
      {state?.error && (
        <p role="alert" className="rounded-md bg-ember-soft px-3 py-2 text-sm text-ember">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" loading={pending} className="mt-2">
        Sign in
      </Button>
    </form>
  );
}
