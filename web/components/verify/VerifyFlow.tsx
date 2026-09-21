"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/useToast";

type Step = "method" | "otp" | "alt";

export function VerifyFlow({
  sessionId,
  profileId,
  maskedEmail,
  maskedPhone,
}: {
  sessionId: string;
  profileId: string;
  maskedEmail: string | null;
  maskedPhone: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("method");
  const [channel, setChannel] = useState<"email" | "sms" | null>(null);
  const [otpId, setOtpId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [altEmail, setAltEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendCode(c: "email" | "sms") {
    setLoading(true);
    try {
      const res = await fetch("/api/otp/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, channel: c, sessionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "could not send code");
      setChannel(c);
      setOtpId(json.otpId);
      setStep("otp");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    if (!otpId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otpId, code }),
      });
      const json = await res.json();
      if (!res.ok || !json.verified) throw new Error(json.error ?? "incorrect code");
      router.push(`/agent/${sessionId}`);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function submitAltEmail() {
    setLoading(true);
    try {
      const res = await fetch("/api/claim/alt-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, altEmail }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "could not continue");
      router.push(`/agent/${sessionId}`);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }

  if (step === "method") {
    return (
      <div className="flex flex-col gap-2">
        {maskedEmail && (
          <button
            onClick={() => sendCode("email")}
            disabled={loading}
            className="flex items-center gap-3 rounded-lg border border-line bg-card p-3.5 text-left hover:border-indigo"
          >
            <span className="text-xl">✉️</span>
            <span>
              <span className="block text-sm font-semibold">Email</span>
              <span className="block font-mono text-sm text-ink-soft">{maskedEmail}</span>
            </span>
            <span className="ml-auto text-sm font-semibold text-indigo">Send code →</span>
          </button>
        )}
        {maskedPhone && (
          <button
            onClick={() => sendCode("sms")}
            disabled={loading}
            className="flex items-center gap-3 rounded-lg border border-line bg-card p-3.5 text-left hover:border-indigo"
          >
            <span className="text-xl">📱</span>
            <span>
              <span className="block text-sm font-semibold">Text message</span>
              <span className="block font-mono text-sm text-ink-soft">{maskedPhone}</span>
            </span>
            <span className="ml-auto text-sm font-semibold text-indigo">Send code →</span>
          </button>
        )}
        <button onClick={() => setStep("alt")} className="mt-2 text-center text-sm text-ink-soft underline">
          I don&apos;t have access to either
        </button>
      </div>
    );
  }

  if (step === "otp") {
    return (
      <Card>
        <p className="mb-3 text-sm text-ink-soft">
          Enter the 6-digit code we sent via {channel === "email" ? "email" : "text"}.
        </p>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          className="mb-3 text-center font-mono text-xl tracking-[0.4em]"
        />
        <Button onClick={verify} disabled={loading || code.length !== 6} className="w-full">
          Verify
        </Button>
        <button onClick={() => setStep("method")} className="mt-3 w-full text-center text-sm text-ink-soft underline">
          Use a different method
        </button>
      </Card>
    );
  }

  return (
    <Card>
      <p className="mb-3 text-sm text-ink-soft">
        We&apos;ll route this to a team member to verify your identity manually. Some fields will stay locked until
        they confirm it&apos;s you.
      </p>
      <Input
        value={altEmail}
        onChange={(e) => setAltEmail(e.target.value)}
        placeholder="An email we can reach you at"
        type="email"
        className="mb-3"
      />
      <Button onClick={submitAltEmail} disabled={loading || !altEmail.includes("@")} className="w-full">
        Continue
      </Button>
    </Card>
  );
}
