export type ScanResult = { status: "clean" | "rejected" | "unavailable"; reason?: string };
export interface FileScanner { scan(buffer: Buffer, fileName: string, mimeType?: string): Promise<ScanResult>; }
const blockedExtensions = new Set(["exe","msi","bat","cmd","com","scr","ps1","sh","bash","zsh","jar","apk","js","mjs","cjs","vbs","php","py","rb","pl","hta","dll","so"]);
export class DevelopmentFileScanner implements FileScanner {
  async scan(buffer: Buffer, fileName: string, _mimeType?: string): Promise<ScanResult> {
    if (buffer.length === 0) return { status:"rejected", reason:"禁止上传空文件" };
    const lower=fileName.toLowerCase();
    const parts=lower.split(".");
    const ext=parts.at(-1) ?? "";
    if (blockedExtensions.has(ext)) return { status:"rejected", reason:"禁止上传可执行文件" };
    if (parts.length >= 3 && blockedExtensions.has(parts.at(-2) ?? "")) return { status:"rejected", reason:"检测到双重扩展名欺骗" };
    const prefix = buffer.subarray(0, 256).toString("utf8").trimStart().toLowerCase();
    if (prefix.startsWith("#!") || prefix.startsWith("<script") || prefix.startsWith("<?php") || prefix.startsWith("<html")) return { status:"rejected", reason:"检测到脚本或可执行内容" };
    return { status:"unavailable", reason:"开发环境未连接真实病毒扫描服务" };
  }
}
