import { z } from "zod";

export const searchSchema = z.object({
  q: z.string().trim().min(2, "Enter at least 2 characters").max(200),
});

export const freeformIntentSchema = z.object({
  text: z.string().trim().min(5, "Tell us a bit more").max(2000),
});

export const claimStartSchema = z.object({
  profileId: z.string().uuid().optional(),
  freeformText: z.string().trim().min(5).max(2000).optional(),
  claimSource: z.enum(["search_results", "claim_email_link"]).default("search_results"),
  claimToken: z.string().trim().min(10).optional(), // required when claimSource is claim_email_link
});

export const otpIssueSchema = z.object({
  profileId: z.string().uuid(),
  channel: z.enum(["email", "sms"]),
  sessionId: z.string().uuid().optional(),
});

export const otpVerifySchema = z.object({
  otpId: z.string().uuid(),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code"),
});

export const altEmailSchema = z.object({
  sessionId: z.string().uuid(),
  altEmail: z.string().trim().email(),
});

export const agentMessageSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().trim().min(1).max(4000),
});

export const claimConfirmSchema = z.object({
  sessionId: z.string().uuid(),
});

export const liveQueueCreateSchema = z.object({
  type: z.enum(["claim", "upgrade", "contact"]),
  sessionId: z.string().uuid().optional(),
  profileId: z.string().uuid().optional(),
  reason: z.string().trim().max(500).optional(),
  summary: z.string().trim().max(2000).optional(),
  requesterName: z.string().trim().max(200).optional(),
  requesterEmail: z.string().trim().email().optional(),
  requesterMessage: z.string().trim().max(2000).optional(),
});

export const liveQueueMessageSchema = z.object({
  requestId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});

export const liveQueueNoteSchema = z.object({
  requestId: z.string().uuid(),
  note: z.string().trim().min(1).max(4000),
});

export const packagesQuoteSchema = z.object({
  cycle: z.enum(["monthly", "yearly"]),
  addon: z.boolean().default(false),
  promoCode: z.string().trim().max(50).optional(),
});

export const billingCheckoutSchema = z.object({
  profileId: z.string().uuid(),
  cycle: z.enum(["monthly", "yearly"]),
  addon: z.boolean().default(false),
  promoCode: z.string().trim().max(50).optional(),
  liveRequestId: z.string().uuid().optional(),
});

export const contactRequestSchema = z.object({
  profileId: z.string().uuid(),
  requesterName: z.string().trim().min(1).max(200),
  requesterEmail: z.string().trim().email(),
  requesterMessage: z.string().trim().min(1).max(2000),
});

export const adminProfilesQuerySchema = z.object({
  filter: z.enum(["all", "unclaimed", "claimed", "pro"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().refine((n) => [10, 25, 50].includes(n)).default(25),
});
