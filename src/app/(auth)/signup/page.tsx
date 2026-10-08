import Link from "next/link";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold">Start your first world</h1>
      <p className="mt-1.5 text-muted">One account, as many worlds and campaigns as you like.</p>
      <SignupForm />
      <p className="mt-6 text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
