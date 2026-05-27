"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-4 w-4 shrink-0 rounded border cursor-pointer",
      "border-[color:var(--border-strong)] bg-[color:var(--surface)]",
      "hover:border-[color:var(--accent-strong)]",
      "data-[state=checked]:bg-[color:var(--accent-strong)] data-[state=checked]:border-[color:var(--accent-strong)]",
      "data-[state=indeterminate]:bg-[color:var(--accent-strong)] data-[state=indeterminate]:border-[color:var(--accent-strong)]",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "transition-colors",
      className,
    )}
    {...props}
  >
    {/* Indicator solo renderiza cuando state ∈ {checked, indeterminate}.
        Forzamos color blanco vía style inline (currentColor en lucide-react)
        para evitar conflictos con `button { color: inherit }` global. */}
    <CheckboxPrimitive.Indicator
      className="flex items-center justify-center"
      style={{ color: "#ffffff" }}
    >
      {props.checked === "indeterminate" ? (
        <Minus className="h-3 w-3" strokeWidth={3} style={{ color: "#ffffff" }} />
      ) : (
        <Check className="h-3 w-3" strokeWidth={3} style={{ color: "#ffffff" }} />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
