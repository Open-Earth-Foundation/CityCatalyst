/**
 * Turns stored report rows into something renderable.
 *
 * Kept pure and free of jsPDF so the shaping — language resolution, ordering,
 * dropping empty chapters — is testable without a document renderer, and so a
 * future on-screen view can share it with the PDF.
 *
 * One report covers one action, because `actionId` is singular upstream. A
 * multi-action report is several of these in document order.
 */
import type { MeedPlanRouteReport } from "@/util/types/meed";
import { resolveI18nList, resolveI18nText } from "../../../localizedText";

export interface MeedReportSection {
  title: string;
  markdown: string;
  /** Caveats the service attaches to a chapter; shown, never silently dropped. */
  limitations: string[];
}

export interface MeedReportActionDocument {
  actionId: string;
  actionName: string;
  sections: MeedReportSection[];
}

export interface MeedReportInput {
  actionId: string;
  actionName: string;
  report: MeedPlanRouteReport | null;
}

/**
 * One action's chapters in the requested language.
 *
 * A chapter with no body in any language is dropped rather than rendered as a
 * heading over blank space — an empty section reads as a generation failure.
 */
export function toReportActionDocument(
  report: MeedPlanRouteReport | null | undefined,
  actionName: string,
  language: string,
): MeedReportActionDocument | null {
  const actionId = report?.actionId;
  if (!report || !actionId) return null;

  const sections: MeedReportSection[] = [];
  for (const chapter of report.chapters ?? []) {
    const markdown = resolveI18nText(chapter?.markdown, language);
    if (!markdown) continue;
    sections.push({
      title: resolveI18nText(chapter?.title, language) ?? chapter?.key ?? "",
      markdown,
      limitations: resolveI18nList(chapter?.limitations, language),
    });
  }

  if (sections.length === 0) return null;
  return { actionId, actionName, sections };
}

/**
 * Assemble the selected actions into one document, in the order the user sees
 * them on screen rather than the order their requests happened to resolve in.
 */
export function toReportDocument(
  reports: MeedReportInput[],
  language: string,
): MeedReportActionDocument[] {
  return reports
    .map(({ actionName, report }) =>
      toReportActionDocument(report, actionName, language),
    )
    .filter((doc): doc is MeedReportActionDocument => doc !== null);
}
