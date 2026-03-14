import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap border text-[11px] font-medium uppercase tracking-[0.14em] transition-colors disabled:pointer-events-none disabled:opacity-40 outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-3.5 shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[color-mix(in_oklab,var(--primary),white_12%)]",
        secondary:
          "border-[var(--border-strong)] bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:bg-[var(--muted)]",
        outline:
          "border-[var(--border-strong)] bg-transparent text-[var(--foreground)] hover:bg-[var(--muted)]",
        ghost:
          "border-transparent text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
      },
      size: {
        default: "h-8 px-3 py-1.5",
        sm: "h-7 px-2.5 text-[10px]",
        lg: "h-9 px-4",
        icon: "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...(!asChild ? { type: props.type ?? "button" } : {})}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
