import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function maskEmail(email: string): string {
  const atIndex = email.indexOf("@");
  if (atIndex === -1) return email;
  const user = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  return `${user.slice(0, 2)}${"*".repeat(Math.max(user.length - 2, 1))}@${domain}`;
}

export function maskPhone(phone: string): string {
  return phone.replace(/\d(?=\d{2})/g, "*");
}
