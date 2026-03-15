"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CtaLinkProps = Omit<ComponentProps<typeof Link>, "className"> &
  Pick<ButtonProps, "variant" | "size"> & {
    children: ReactNode;
    className?: string;
  };

export function CtaLink({
  children,
  href,
  variant = "outline",
  size = "default",
  className,
  ...props
}: CtaLinkProps) {
  return (
    <Button
      asChild
      variant={variant}
      size={size}
      className={cn("group", className)}
    >
      <Link href={href} {...props}>
        <span>{children}</span>
        <ChevronRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
      </Link>
    </Button>
  );
}
