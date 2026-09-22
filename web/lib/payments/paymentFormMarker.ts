// A chat_messages.body prefix that means "render an inline payment form
// here, not text" — used by both the AI copilot's show_payment_form tool
// (supabase/functions/dashboard-copilot/index.ts, which can't import this
// file directly since it runs in Deno — duplicated there, keep in sync) and
// the live agent's payment-request route. DashboardCopilot.tsx checks for
// this prefix before rendering a message as a plain text bubble.
export const PAYMENT_FORM_MARKER = "__PAYMENT_FORM__";

export type PaymentFormPayload = {
  cycle: "monthly" | "yearly";
  addon: boolean;
  liveRequestId?: string;
};

export function encodePaymentForm(payload: PaymentFormPayload): string {
  return `${PAYMENT_FORM_MARKER}${JSON.stringify(payload)}`;
}

export function decodePaymentForm(body: string): PaymentFormPayload | null {
  if (!body.startsWith(PAYMENT_FORM_MARKER)) return null;
  try {
    return JSON.parse(body.slice(PAYMENT_FORM_MARKER.length));
  } catch {
    return null;
  }
}
