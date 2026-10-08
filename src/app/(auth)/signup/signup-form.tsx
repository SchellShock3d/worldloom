"use client";

import { useActionState } from "react";
import { signup } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export function SignupForm() {
  const [state, action, pending] = useActionState(signup, undefined);
  return (
    <form action={action} className="mt-8 flex flex-col gap-4">
      <Field label="Your name" htmlFor="name">
        <Input id="name" name="name" autoComplete="name" required defaultValue={state?.fields?.name} autoFocus className="h-10" />
      </Field>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state?.fields?.email} className="h-10" />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 8 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="h-10" />
      </Field>
      {state?.error && (
        <p role="alert" className="rounded-md bg-ember-soft px-3 py-2 text-sm text-ember">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" loading={pending} className="mt-2">
        Create account
      </Button>
    </form>
  );
}
