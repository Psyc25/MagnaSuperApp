/**
 * Tujuan redirect setelah login (`redirectTo`) -- hanya path internal di
 * bawah /dashboard. Dulu cukup dicek "diawali / tapi bukan //", padahal
 * browser membaca "/\evil.com" sebagai "//evil.com" (open redirect ke situs
 * phishing tepat setelah login sungguhan).
 */
export function safeRedirectTarget(value: unknown, fallback = "/dashboard"): string {
  const target = typeof value === "string" ? value : "";
  if (!target.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(target)) return fallback;
  let url: URL;
  try {
    url = new URL(target, "http://internal.invalid");
  } catch {
    return fallback;
  }
  if (url.origin !== "http://internal.invalid") return fallback;
  if (url.pathname !== "/dashboard" && !url.pathname.startsWith("/dashboard/")) return fallback;
  return `${url.pathname}${url.search}`;
}
