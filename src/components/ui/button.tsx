"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * shadcn-style Button, with the variants mapped to the project's existing
 * design tokens (--accent, --border-strong, etc.) so it visually blends with
 * the rest of the Google-Material-inspired admin shell.
 *
 * Variants:
 *   default      — primary CTA (accent fill)
 *   secondary    — neutral fill
 *   outline      — outlined accent
 *   ghost        — transparent, text-only with subtle hover
 *   destructive  — red, for delete actions
 *   link         — looks like a link
 *
 * Sizes:
 *   default — 36px tall, regular padding
 *   sm      — 32px tall, compact
 *   lg      — 44px tall, more padding
 *   icon    — square (38px) for icon-only buttons
 */
const buttonVariants = cva(
  // cursor-pointer es CRÍTICO — sin él los <button> no muestran el pointer
  // del navegador y no se sienten clickeables. shadcn oficial lo omitió en
  // versiones recientes; aquí lo agregamos explícitamente.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium cursor-pointer transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // CTA filled: fondo azul --accent-strong + texto blanco. text-white!
        // (suffix-important en Tailwind v4) por si la regla global
        // `button { color: inherit }` gana el cascade.
        default:
          "bg-[color:var(--accent-strong)] text-white! font-bold shadow-sm hover:bg-[color:var(--accent-strong-hover)]",
        secondary:
          "bg-[color:var(--bg-soft)] text-[color:var(--text)] hover:bg-[color:var(--bg-sunken)]",
        outline:
          "border border-[color:var(--border-strong)] bg-transparent text-[color:var(--accent)] hover:bg-[color:var(--accent-softer)] hover:border-[color:var(--accent)]",
        ghost:
          "bg-transparent text-[color:var(--text-muted)] hover:bg-[color:var(--bg-soft)] hover:text-[color:var(--text)]",
        destructive:
          "bg-[#dc2626] text-white hover:bg-[#b91c1c] shadow-sm",
        link: "bg-transparent text-[color:var(--accent)] hover:underline p-0 h-auto",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6 text-base",
        icon: "h-9 w-9 p-0 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => {
    return (
      <button
        type={type}
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
