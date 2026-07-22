export function parseProductLookup(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const key of ["publicCode", "productCode", "serialNumber", "serial"]) {
      if (typeof parsed[key] === "string" && parsed[key].trim()) return parsed[key].trim();
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
