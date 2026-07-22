import { describe, expect, it } from "vitest";

import { parseProductLookup } from "../shared/product-lookup";

describe("product barcode and QR lookup", () => {
  it("parses raw public codes and serials", () => {
    expect(parseProductLookup(" DEMO-UNIT-PHONE-001 ")).toBe("DEMO-UNIT-PHONE-001");
    expect(parseProductLookup("SN-DEMO-1")).toBe("SN-DEMO-1");
  });

  it("parses passport links and scanner JSON without camera access", () => {
    expect(parseProductLookup("https://demo.local/products/passport/DEMO-UNIT-PHONE-001")).toBe("DEMO-UNIT-PHONE-001");
    expect(parseProductLookup(JSON.stringify({ publicCode: "DEMO-UNIT-BOOK-001" }))).toBe("DEMO-UNIT-BOOK-001");
    expect(parseProductLookup("https://demo.local/scan?serial=SN-DEMO-2")).toBe("SN-DEMO-2");
    expect(parseProductLookup(JSON.stringify({ passportUrl: "https://demo.local/products/passport/DEMO-UNIT-BOOK-001" }))).toBe("DEMO-UNIT-BOOK-001");
  });
});
