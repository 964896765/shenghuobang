import { Linking, Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

import { getApiBaseUrl } from "@/constants/app";
import * as Auth from "@/lib/_core/auth";
import { fetchWithTimeout } from "@/lib/_core/network";
import type { BadgeTone } from "@/lib/labels";

const PROJECT_DESIGN_PROTOTYPE_REASON_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "登录状态已失效，请重新登录。",
  PROJECT_NOT_FOUND: "项目不存在或暂不可用。",
  DESIGN_VERSION_NOT_FOUND: "设计版本不存在或暂不可用。",
  DESIGN_VERSION_FILE_NOT_FOUND: "设计文件不存在或暂不可用。",
  MILESTONE_NOT_FOUND: "原型里程碑不存在或暂不可用。",
  PROJECT_FILE_NOT_FOUND: "文件不存在或暂不可用。",
  FILE_NOT_FOUND: "文件不存在或暂不可用。",
  DELIVERABLE_FILE_NOT_FOUND: "成果文件不存在或暂不可用。",
  DELIVERABLE_SUBMISSION_NOT_FOUND: "成果版本不存在或暂不可用。",
  PROJECT_MEMBERSHIP_INACTIVE: "你的项目成员身份已失效，请刷新后重试。",
  RESOURCE_RELATION_REQUIRED: "内容不存在或你暂时无权访问。",
  PROJECT_INACTIVE: "项目当前不可操作。",
  CONCURRENT_MODIFICATION: "内容已被其他成员更新，请刷新后重试。",
  IDEMPOTENCY_CONFLICT: "该请求与此前操作不一致，请刷新后重试。",
  TITLE_INVALID: "请填写标题。",
  SUMMARY_INVALID: "请填写摘要。",
  DELIVERABLE_NOTE_INVALID: "请填写成果说明。",
  REQUEST_ID_INVALID: "请求标识无效，请重试。",
  PROTOTYPE_MILESTONE_REQUIRED: "请选择原型里程碑。",
  MILESTONE_ASSIGNEE_INVALID: "该成员与任务类型不匹配，请重新选择。",
  MILESTONE_TASK_TYPE_INVALID: "任务类型无效。",
  DESIGN_VERSION_FILES_REQUIRED: "请至少上传一个设计文件后再提交。",
  RESOURCE_STATE_FORBIDDEN: "当前状态不允许执行此操作。",
  FORBIDDEN: "当前身份没有执行此操作的权限。",
  NOT_FOUND: "内容不存在或暂不可用。",
  CONFLICT: "内容状态已变化，请刷新后重试。",
};

function entropy(): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return random.replace(/[^A-Za-z0-9.-]/g, "").slice(0, 36);
}

export class StableProjectRequestIds {
  private readonly values = new Map<string, string>();

  get(operationKey: string): string {
    const existing = this.values.get(operationKey);
    if (existing) return existing;
    const safeKey = operationKey.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 20) || "b22";
    const value = `b22.${safeKey}.${entropy()}`.slice(0, 64);
    this.values.set(operationKey, value);
    return value;
  }

  complete(operationKey: string) {
    this.values.delete(operationKey);
  }
}

export function projectDesignPrototypeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code = Object.keys(PROJECT_DESIGN_PROTOTYPE_REASON_MESSAGES).find((item) => message.includes(item));
  if (code) return PROJECT_DESIGN_PROTOTYPE_REASON_MESSAGES[code];
  if (/network|fetch|timeout|offline/i.test(message)) return "网络连接不可用，请检查网络后重试。";
  return "操作未完成，请稍后重试。";
}

export const DESIGN_VERSION_STATUS_LABELS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "草稿", tone: "gray" },
  submitted: { label: "已提交", tone: "blue" },
  superseded: { label: "已被新版本替代", tone: "orange" },
  withdrawn: { label: "已撤回", tone: "gray" },
};

export const PROTOTYPE_MILESTONE_STATUS_LABELS: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "planned", tone: "gray" },
  planned: { label: "planned", tone: "gray" },
  in_progress: { label: "in_progress", tone: "teal" },
  submitted: { label: "submitted", tone: "blue" },
};

export const DESIGN_FILE_ROLE_LABELS: Record<string, string> = {
  source: "源文件",
  preview: "预览图",
  reference: "参考资料",
  specification: "规格说明",
  other: "其他",
};

export const PROTOTYPE_TASK_TYPE_LABELS: Record<string, string> = {
  designer: "设计任务",
  engineer: "工程任务",
};

export function composePrototypeMilestoneDescription(input: {
  description?: string;
  plannedStartAt?: string;
  plannedEndAt?: string;
  note?: string;
}) {
  const body = input.description?.trim() ?? "";
  const lines = [
    input.plannedStartAt?.trim() ? `计划开始：${input.plannedStartAt.trim()}` : "",
    input.plannedEndAt?.trim() ? `计划结束：${input.plannedEndAt.trim()}` : "",
    input.note?.trim() ? `备注：${input.note.trim()}` : "",
  ].filter(Boolean);
  return [body, ...lines].filter(Boolean).join("\n\n") || undefined;
}

export function parsePrototypeMilestoneDescription(value?: string | null) {
  const source = value?.trim() ?? "";
  if (!source) {
    return { description: "", plannedStartAt: "", plannedEndAt: "", note: "" };
  }
  const lines = source.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  let plannedStartAt = "";
  let plannedEndAt = "";
  let note = "";
  const bodyLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("计划开始：")) {
      plannedStartAt = line.slice("计划开始：".length).trim();
    } else if (line.startsWith("计划结束：")) {
      plannedEndAt = line.slice("计划结束：".length).trim();
    } else if (line.startsWith("备注：")) {
      note = line.slice("备注：".length).trim();
    } else {
      bodyLines.push(line);
    }
  }
  return {
    description: bodyLines.join("\n\n"),
    plannedStartAt,
    plannedEndAt,
    note,
  };
}

export async function readLocalFileBase64(uri: string): Promise<string> {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",").pop() ?? "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

export class ControlledAccessTracker {
  private readonly webUrls = new Set<string>();
  private readonly nativeFiles = new Set<string>();

  async openPath(path: string): Promise<void> {
    const token = await Auth.getSessionToken();
    const url = `${getApiBaseUrl()}${path}`;
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    if (Platform.OS === "web") {
      const response = await fetchWithTimeout(url, { credentials: "include", headers }, 30_000);
      if (!response.ok) {
        throw new Error(response.status === 403 ? "FORBIDDEN" : response.status === 404 ? "NOT_FOUND" : "RESOURCE_RELATION_REQUIRED");
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      this.webUrls.add(objectUrl);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.click();
      return;
    }
    const destination = `${FileSystem.cacheDirectory}project-controlled-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const downloaded = await FileSystem.downloadAsync(url, destination, { headers });
    if (downloaded.status !== 200) {
      throw new Error(downloaded.status === 403 ? "FORBIDDEN" : downloaded.status === 404 ? "NOT_FOUND" : "RESOURCE_RELATION_REQUIRED");
    }
    this.nativeFiles.add(downloaded.uri);
    const openUri = Platform.OS === "android" ? await FileSystem.getContentUriAsync(downloaded.uri) : downloaded.uri;
    await Linking.openURL(openUri);
  }

  async cleanup(): Promise<void> {
    if (Platform.OS === "web") {
      this.webUrls.forEach((value) => URL.revokeObjectURL(value));
      this.webUrls.clear();
      return;
    }
    await Promise.all([...this.nativeFiles].map(async (value) => {
      try {
        await FileSystem.deleteAsync(value, { idempotent: true });
      } catch {
        // Ignore cleanup failures for temporary files.
      }
    }));
    this.nativeFiles.clear();
  }
}
