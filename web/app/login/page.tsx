import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 px-5 py-16">
      <Suspense fallback={<p className="text-center text-sm text-ink-soft">Loading…</p>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
