import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold", {
  variants: {
    variant: {
      default: "bg-indigo-soft text-indigo",
      pro: "bg-coral text-white",
      top5: "border border-amber bg-amber-soft text-amber",
      mint: "bg-mint-soft text-mint",
      slate: "bg-slate-soft text-slate",
      amber: "bg-amber-soft text-amber",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}
