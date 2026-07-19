const FIELD_GROUPS: Record<string, readonly string[]> = {
  phone: ["phone", "contactPhone", "contactPhoneEncrypted", "contactPhoneLast4"],
  email: ["email", "contactEmail", "contactEmailEncrypted"],
  identity_document: ["idNumber", "idNumberDigest", "idNumberLast4", "identityDocument", "identityDocumentUrl", "certificateFile"],
  certification_sensitive: ["realName", "rejectReason", "applicationData"],
  business_registration: ["registrationNo", "registrationNoDigest", "registrationNoLast4", "businessLicense", "businessLicenseUrl"],
  settlement: ["bankAccount", "bankAccountNo", "bankName", "settlementAccount", "settlementChannelDetail"],
  exact_address: ["address", "addressText", "exactAddress", "doorplate"],
  coordinates: ["latitude", "longitude", "exactLatitude", "exactLongitude", "coordinates"],
  supplier_quote: ["supplierQuote", "supplierQuoteContent", "quotedUnitPrice", "supplierPrice", "totalPrice", "deliverables", "exclusions", "paymentTerms"],
  file_secret: ["fileName", "originalName", "storageKey", "publicUrl", "permanentUrl"],
  bom_cost: ["bomCost", "bomUnitCost", "bomTotalCost", "materialCost"],
  process: ["processContent", "manufacturingProcess", "processFile"],
  design_source: ["designSource", "designSourceFile", "cadFile", "sourceProjectFile"],
  audit_sensitive: ["contextData", "detail", "ipAddress", "userAgent", "error", "errorMessage", "payload", "token"],
};

export const SENSITIVE_FIELD_NAMES = [...new Set(Object.values(FIELD_GROUPS).flat())];

function allowed(field: string, fieldAccess: readonly string[]): boolean {
  if (fieldAccess.includes("*")) return true;
  if (fieldAccess.includes(field)) return true;
  return Object.entries(FIELD_GROUPS).some(([group, fields]) => fields.includes(field) && fieldAccess.includes(`${group}:FULL`));
}

export function computeFieldMask(input: {
  availableFields: readonly string[];
  fieldAccess: readonly string[];
  view: "list" | "detail" | "export";
}): string[] {
  const sensitive = new Set(SENSITIVE_FIELD_NAMES);
  return [...new Set(input.availableFields.filter((field) => {
    if (!sensitive.has(field)) return false;
    if (input.view === "list") return true;
    return !allowed(field, input.fieldAccess);
  }))].sort();
}

export function applyFieldMask<T extends Record<string, unknown>>(record: T, fieldMask: readonly string[]): Partial<T> {
  const denied = new Set(fieldMask);
  return Object.fromEntries(Object.entries(record).filter(([key]) => !denied.has(key))) as Partial<T>;
}
