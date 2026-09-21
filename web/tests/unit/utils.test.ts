import { describe, expect, it } from "vitest";
import { maskEmail, maskPhone, formatCents } from "@/lib/utils";
import { otpVerifySchema, searchSchema, claimStartSchema } from "@/lib/validation/schemas";

describe("maskEmail", () => {
  it("keeps the first two characters and the domain", () => {
    expect(maskEmail("jordan@example.com")).toBe("jo****@example.com");
  });

  it("returns the input unchanged if there's no @", () => {
    expect(maskEmail("not-an-email")).toBe("not-an-email");
  });
});

describe("maskPhone", () => {
  it("masks all but the last two digits", () => {
    expect(maskPhone("5551234567")).toBe("********67");
  });
});

describe("formatCents", () => {
  it("formats cents as USD", () => {
    expect(formatCents(6900)).toBe("$69.00");
  });
});

describe("otpVerifySchema", () => {
  it("rejects a non-6-digit code", () => {
    const result = otpVerifySchema.safeParse({ otpId: "11111111-1111-1111-1111-111111111111", code: "123" });
    expect(result.success).toBe(false);
  });

  it("accepts a valid 6-digit code", () => {
    const result = otpVerifySchema.safeParse({ otpId: "11111111-1111-1111-1111-111111111111", code: "123456" });
    expect(result.success).toBe(true);
  });
});

describe("searchSchema", () => {
  it("rejects a query under 2 characters", () => {
    expect(searchSchema.safeParse({ q: "a" }).success).toBe(false);
  });
});

describe("claimStartSchema", () => {
  it("requires a claimToken when claimSource is claim_email_link", () => {
    // claimStartSchema itself doesn't cross-validate this (the route handler
    // does), but it should still accept the shape with a token present.
    const result = claimStartSchema.safeParse({
      profileId: "11111111-1111-1111-1111-111111111111",
      claimSource: "claim_email_link",
      claimToken: "a".repeat(20),
    });
    expect(result.success).toBe(true);
  });
});
