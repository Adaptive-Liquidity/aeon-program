/**
 * Category helpers — AEON uses fixed [u8; 16] category tags.
 */

/** Zero category (all-allowed when authority.category_count == 0). */
export function zeroCategory(): number[] {
  return new Array(16).fill(0);
}

/**
 * Encode a short ASCII label into a 16-byte category tag (padded with zeros).
 * Labels longer than 16 bytes are truncated.
 */
export function categoryFromLabel(label: string): number[] {
  const out = new Array(16).fill(0);
  const bytes = Buffer.from(label, "utf8");
  for (let i = 0; i < Math.min(16, bytes.length); i++) {
    out[i] = bytes[i];
  }
  return out;
}

/** Compare two 16-byte categories. */
export function categoriesEqual(a: number[] | Uint8Array, b: number[] | Uint8Array): boolean {
  if (a.length !== 16 || b.length !== 16) return false;
  for (let i = 0; i < 16; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Decode leading non-zero bytes as UTF-8 label (best-effort). */
export function categoryToLabel(cat: number[] | Uint8Array): string {
  let end = cat.length;
  while (end > 0 && cat[end - 1] === 0) end--;
  return Buffer.from(cat.slice(0, end)).toString("utf8");
}
