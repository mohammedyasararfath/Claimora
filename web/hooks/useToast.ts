"use client";

import { create } from "zustand";

interface ToastItem {
  id: number;
  message: string;
  variant?: "default" | "error" | "success";
}

interface ToastState {
  toasts: ToastItem[];
  push: (message: string, variant?: ToastItem["variant"]) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (message, variant = "default") => {
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts, { id, message, variant }] }));
    setTimeout(() => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })), 4000);
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export function useToast() {
  const push = useToastStore((s) => s.push);
  return { toast: push };
}
