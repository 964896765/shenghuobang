export function parseProductLookup(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const key of ["publicCode", "productCode", "serialNumber", "serial"]) {
      if (typeof parsed[key] === "string" && parsed[key].trim()) return parsed[key].trim();
    }
    // QR payloads may wrap a supported passport link under a descriptive
    // URL field. Reuse the same URL parser while avoiding recursion loops.
    for (const key of ["passportUrl", "url", "href"]) {
      if (typeof parsed[key] === "string" && parsed[key].trim()) {
        const nested = parseProductLookup(parsed[key].trim());
        if (nested && nested !== parsed[key].trim()) return nested;
      }
    }
  } catch {
    // Raw scanner payloads and URLs are handled below.
  }
  try {
    const url = new URL(raw);
    const queryCode = url.searchParams.get("publicCode") ?? url.searchParams.get("code") ?? url.searchParams.get("serial");
    if (queryCode) return queryCode.trim();
    const segments = url.pathname.split("/").filter(Boolean);
    const passportIndex = segments.lastIndexOf("passport");
    if (passportIndex >= 0 && segments[passportIndex + 1]) return decodeURIComponent(segments[passportIndex + 1]);
  } catch {
    // The value is a plain barcode, public code or serial number.
  }
  return raw;
}
