import type {
  DocumentPointValue,
  DocumentWorkspacePoint,
} from "@/util/document-workspace";

export const pointGroups = [
  "confirmation",
  "conflict",
  "evidence",
  "decision",
  "waiting",
  "covered",
] as const;
export type PointGroup = (typeof pointGroups)[number];

export function pointGroup(point: DocumentWorkspacePoint): PointGroup {
  if (["answered", "assumption", "not_applicable"].includes(point.status))
    return "covered";
  if (point.task?.status === "parked" || point.task?.status === "waiting")
    return "waiting";
  if (point.status === "conflict") return "conflict";
  if (point.status === "needs_confirmation") return "confirmation";
  return point.kind === "decision" ? "decision" : "evidence";
}

export function pointValueText(value: DocumentPointValue): string {
  if (value === null) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function parsePointAnswer(
  value: string,
  answerType: DocumentWorkspacePoint["answer_type"],
): string | number | null {
  if (!value.trim()) return null;
  if (answerType !== "number") return value.trim();
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
