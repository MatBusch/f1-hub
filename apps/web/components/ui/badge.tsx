import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] leading-none font-semibold uppercase tracking-[0.16em] [&_svg]:shrink-0 [&_svg]:self-center",
  {
    variants: {
      variant: {
        default: "bg-[var(--muted)] text-[var(--foreground)]",
        outline:
          "border border-[var(--border-strong)] bg-[var(--panel)] text-[var(--foreground)]",
        live: "bg-[var(--destructive)] text-white",
        subtle:
          "border border-[var(--border)] bg-[var(--panel)] text-[var(--muted-foreground)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, className }))} {...props} />
  );
}

export { badgeVariants };
