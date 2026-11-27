/** Accepts http(s) URLs or bare domains (optionally with a path). Returns the trimmed input or null. */
export function validInput(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s.length > 2048 || /\s/.test(s)) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(s);
  if (hasScheme && !/^https?:\/\//i.test(s)) return null;
  try {
    const u = new URL(hasScheme ? s : `https://${s}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    if (!/^[a-z0-9.-]+\.[a-z0-9-]{2,}$/i.test(u.hostname)) return null;
    return s;
  } catch {
    return null;
  }
}
