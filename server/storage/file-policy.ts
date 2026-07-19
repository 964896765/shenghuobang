import path from "node:path";

export type DetectedFile = { mimeType: string; extension: string };
const extensionMimes: Record<string, string[]> = {
  jpg: ["image/jpeg"], jpeg: ["image/jpeg"], png: ["image/png"], gif: ["image/gif"], webp: ["image/webp"],
  pdf: ["application/pdf"], json: ["application/json", "text/plain"], txt: ["text/plain"], csv: ["text/csv", "text/plain"],
  zip: ["application/zip"], docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/zip"],
};

export function sanitizeFileName(input: string) {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 255 || /[\0-\x1f\x7f]/.test(trimmed)) throw new Error("非法文件名");
  if (path.basename(trimmed) !== trimmed || /[\\/]/.test(trimmed) || trimmed === "." || trimmed === "..") throw new Error("非法文件名");
  return trimmed.replace(/[<>:"|?*]/g, "_");
}

export function detectFile(buffer: Buffer): DetectedFile {
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return { mimeType: "image/png", extension: "png" };
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return { mimeType: "image/jpeg", extension: "jpg" };
  if (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a") return { mimeType: "image/gif", extension: "gif" };
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return { mimeType: "image/webp", extension: "webp" };
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") return { mimeType: "application/pdf", extension: "pdf" };
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && [0x03, 0x05, 0x07].includes(buffer[2]) && [0x04, 0x06, 0x08].includes(buffer[3])) return { mimeType: "application/zip", extension: "zip" };
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  if (!sample.includes(0) && sample.toString("utf8").includes("�") === false) {
    try { JSON.parse(buffer.toString("utf8")); return { mimeType: "application/json", extension: "json" }; } catch { return { mimeType: "text/plain", extension: "txt" }; }
  }
  return { mimeType: "application/octet-stream", extension: "bin" };
}

export function validateMimeAndExtension(fileName: string, claimedMime: string, detected: DetectedFile) {
  const extension = fileName.toLowerCase().split(".").at(-1) ?? "";
  const allowed = extensionMimes[extension];
  if (!allowed) throw new Error("不支持的文件扩展名");
  if (!allowed.includes(claimedMime)) throw new Error("文件扩展名与 MIME 类型不匹配");
  if (!allowed.includes(detected.mimeType)) throw new Error("文件内容与声明类型不匹配");
  return extension;
}
