import { randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // skips ambiguous chars

// "INC-YYYY-XXXXXX" where XXXXXX is 6 base32-ish unambiguous chars.
// 32^6 ≈ 1.07e9 → with ~10K/year incidents, collision risk is negligible
// but we still retry on unique-violation at the caller.
export function generateIncidentCode(now = new Date()): string {
  const year = now.getFullYear();
  const buf = randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += ALPHABET[buf[i]! % ALPHABET.length];
  }
  return `INC-${year}-${out}`;
}
