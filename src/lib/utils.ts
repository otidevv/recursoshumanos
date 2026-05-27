import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Combine class names with Tailwind merge for conflict resolution. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
