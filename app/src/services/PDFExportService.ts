import jsPDF from "jspdf";
import "jspdf-autotable";
import { TFunction } from "i18next";

interface ActionPlanPDFData {
  metadata?: {
    cityName?: string | null;
    actionName?: string | null;
    language?: string | null;
    createdAt?: string | null;
  };
  content?: {
    introduction?: {
      city_description?: string | null;
      action_description?: string | null;
      national_strategy_explanation?: string | null;
    };
    subactions?: {
      items?: Array<{
        number: number;
        title: string;
        description: string;
      }>;
    };
    institutions?: {
      items?: Array<{
        name: string;
        description: string;
        url?: string;
      }>;
    };
    milestones?: {
      items?: Array<{
        number: number;
        title: string;
        description: string;
      }>;
    };
    mitigations?: {
      items?: Array<{
        title: string;
        description: string;
      }>;
    };
    adaptations?: {
      items?: Array<{
        title: string;
        description: string;
      }>;
    };
    sdgs?: {
      items?: Array<{
        title: string;
        description: string;
      }>;
    };
  };
}

// CityCatalyst brand palette (see src/lib/theme/recipes/app-theme.ts) as RGB tuples
type RGB = [number, number, number];
const BRAND: RGB = [35, 81, 220]; // #2351DC
const BRAND_DARK: RGB = [0, 30, 167]; // #001EA7
const INK: RGB = [0, 0, 31]; // #00001F
const INK_TERTIARY: RGB = [75, 76, 99]; // #4B4C63
const BG_NEUTRAL: RGB = [232, 234, 251]; // #E8EAFB
const BORDER: RGB = [215, 216, 250]; // #D7D8FA
const MUTED: RGB = [136, 135, 128]; // #888780

const MARGIN_X = 20;
const CONTENT_WIDTH = 170;
const LOGO_SRC = "/assets/citycatalyst-logo-blue.png";
const LOGO_ASPECT = 216 / 996; // height / width of citycatalyst-logo-blue.png

export class PDFExportService {
  // Load the wide brand logo as a data URL for jsPDF.addImage. Returns null on failure.
  private static async loadLogo(): Promise<string | null> {
    try {
      const res = await fetch(LOGO_SRC);
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  private static addHeader(
    doc: jsPDF,
    cityName: string,
    actionName: string,
    t: TFunction,
    logo: string | null,
  ): number {
    let cursor = 16;

    // Brand logo (wide navy lockup); falls back gracefully if it failed to load
    if (logo) {
      const logoWidth = 42;
      const logoHeight = logoWidth * LOGO_ASPECT;
      try {
        doc.addImage(logo, "PNG", MARGIN_X, cursor, logoWidth, logoHeight);
      } catch {
        // ignore — continue without the logo
      }
      cursor += logoHeight + 10;
    } else {
      cursor += 6;
    }

    // Title
    doc.setTextColor(...INK);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text(t("pdf.title"), MARGIN_X, cursor);
    cursor += 8;

    // Subtitle: action name — city
    doc.setFontSize(13);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK_TERTIARY);
    const subtitleText = `${actionName} — ${cityName}`;
    const textLines = doc.splitTextToSize(subtitleText, CONTENT_WIDTH);
    doc.text(textLines, MARGIN_X, cursor);
    cursor += textLines.length * 6 + 4;

    // Brand accent rule
    doc.setDrawColor(...BRAND);
    doc.setLineWidth(1);
    doc.line(MARGIN_X, cursor, MARGIN_X + CONTENT_WIDTH, cursor);

    return cursor + 10;
  }

  private static addSection(
    doc: jsPDF,
    title: string,
    yPosition: number,
  ): number {
    if (yPosition > 255) {
      doc.addPage();
      yPosition = 20;
    }

    // Accent bar
    doc.setFillColor(...BRAND);
    doc.rect(MARGIN_X, yPosition - 3.6, 1.4, 5, "F");

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND_DARK);
    doc.text(title, MARGIN_X + 4, yPosition);

    return yPosition + 10;
  }

  private static addText(
    doc: jsPDF,
    text: string,
    yPosition: number,
    maxWidth: number = CONTENT_WIDTH,
  ): number {
    if (!text) return yPosition;

    if (yPosition > 270) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);

    const lines = doc.splitTextToSize(text, maxWidth);
    doc.text(lines, MARGIN_X, yPosition);

    return yPosition + lines.length * 5 + 8;
  }

  // Renders "Label: value" with a colored label, wrapping the value.
  private static addLabeledText(
    doc: jsPDF,
    label: string,
    text: string,
    yPosition: number,
  ): number {
    if (!text) return yPosition;

    if (yPosition > 265) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND);
    doc.text(`${label}`, MARGIN_X, yPosition);
    const labelWidth = doc.getTextWidth(`${label} `);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    const firstLineWidth = CONTENT_WIDTH - labelWidth;
    const words = text.split(" ");
    // Fit as much as possible on the label line, then wrap the rest full-width.
    let firstLine = "";
    let rest = text;
    for (let i = words.length; i > 0; i--) {
      const candidate = words.slice(0, i).join(" ");
      if (doc.getTextWidth(candidate) <= firstLineWidth) {
        firstLine = candidate;
        rest = words.slice(i).join(" ");
        break;
      }
    }
    doc.text(firstLine, MARGIN_X + labelWidth, yPosition);
    let y = yPosition + 5;
    if (rest) {
      const restLines = doc.splitTextToSize(rest, CONTENT_WIDTH);
      doc.text(restLines, MARGIN_X, y);
      y += restLines.length * 5;
    }
    return y + 8;
  }

  private static addNumberedList(
    doc: jsPDF,
    items: Array<{ number?: number; title: string; description: string }>,
    yPosition: number,
  ): number {
    let currentY = yPosition;

    items.forEach((item, index) => {
      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
      }

      // Numbered badge
      const badgeX = MARGIN_X + 2.5;
      doc.setFillColor(...BG_NEUTRAL);
      doc.circle(badgeX, currentY - 1.2, 3, "F");
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BRAND_DARK);
      doc.text(String(item.number || index + 1), badgeX, currentY, {
        align: "center",
      });

      // Title
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...INK);
      const titleLines = doc.splitTextToSize(item.title, CONTENT_WIDTH - 10);
      doc.text(titleLines, MARGIN_X + 8, currentY);
      currentY += titleLines.length * 5 + 2;

      // Description
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...INK_TERTIARY);
      const descLines = doc.splitTextToSize(item.description, CONTENT_WIDTH - 8);
      doc.text(descLines, MARGIN_X + 8, currentY);
      currentY += descLines.length * 5 + 9;
    });

    return currentY;
  }

  private static addBulletList(
    doc: jsPDF,
    items: Array<{ title?: string; name?: string; description: string }>,
    yPosition: number,
    t: TFunction,
  ): number {
    let currentY = yPosition;

    items.forEach((item) => {
      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
      }

      // Brand bullet
      doc.setFillColor(...BRAND);
      doc.circle(MARGIN_X + 1.5, currentY - 1.3, 1, "F");

      // Title
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...INK);
      const titleText = item.title || item.name || t("pdf.labels.item");
      const titleLines = doc.splitTextToSize(titleText, CONTENT_WIDTH - 8);
      doc.text(titleLines, MARGIN_X + 6, currentY);
      currentY += titleLines.length * 5 + 2;

      // Description
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...INK_TERTIARY);
      const descLines = doc.splitTextToSize(item.description, CONTENT_WIDTH - 6);
      doc.text(descLines, MARGIN_X + 6, currentY);
      currentY += descLines.length * 5 + 9;
    });

    return currentY;
  }

  private static addFooter(doc: jsPDF, t: TFunction) {
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.3);
      doc.line(MARGIN_X, 283, MARGIN_X + CONTENT_WIDTH, 283);

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...MUTED);
      doc.text(
        `${t("pdf.footer.generated-by")} · ${t("pdf.footer.page")} ${i} ${t("pdf.footer.of")} ${pageCount}`,
        MARGIN_X,
        288,
      );
      doc.text(
        `${t("pdf.footer.generated-on")} ${new Date().toLocaleDateString()}`,
        MARGIN_X + CONTENT_WIDTH,
        288,
        { align: "right" },
      );
    }
  }

  public static async generateActionPlanPDF(
    planData: ActionPlanPDFData,
    actionName: string,
    cityName: string,
    t: TFunction,
  ): Promise<void> {
    const doc = new jsPDF();
    const logo = await this.loadLogo();

    let yPosition = this.addHeader(doc, cityName, actionName, t, logo);

    // Introduction section
    if (planData.content?.introduction) {
      yPosition = this.addSection(doc, t("pdf.sections.overview"), yPosition);

      if (planData.content.introduction.city_description) {
        yPosition = this.addLabeledText(
          doc,
          `${t("pdf.labels.city-context")}:`,
          planData.content.introduction.city_description,
          yPosition,
        );
      }

      if (planData.content.introduction.action_description) {
        yPosition = this.addLabeledText(
          doc,
          `${t("pdf.labels.action-description")}:`,
          planData.content.introduction.action_description,
          yPosition,
        );
      }

      if (planData.content.introduction.national_strategy_explanation) {
        yPosition = this.addLabeledText(
          doc,
          `${t("pdf.labels.national-strategy")}:`,
          planData.content.introduction.national_strategy_explanation,
          yPosition,
        );
      }
    }

    // Subactions
    if (planData.content?.subactions?.items?.length) {
      yPosition = this.addSection(
        doc,
        `${t("pdf.sections.implementation-steps")} (${planData.content.subactions.items.length})`,
        yPosition + 4,
      );
      yPosition = this.addNumberedList(
        doc,
        planData.content.subactions.items,
        yPosition,
      );
    }

    // Institutions
    if (planData.content?.institutions?.items?.length) {
      yPosition = this.addSection(
        doc,
        `${t("pdf.sections.key-institutions")} (${planData.content.institutions.items.length})`,
        yPosition + 4,
      );
      yPosition = this.addBulletList(
        doc,
        planData.content.institutions.items,
        yPosition,
        t,
      );
    }

    // Milestones
    if (planData.content?.milestones?.items?.length) {
      yPosition = this.addSection(
        doc,
        `${t("pdf.sections.milestones")} (${planData.content.milestones.items.length})`,
        yPosition + 4,
      );
      yPosition = this.addNumberedList(
        doc,
        planData.content.milestones.items,
        yPosition,
      );
    }

    // Mitigations
    if (planData.content?.mitigations?.items?.length) {
      yPosition = this.addSection(
        doc,
        `${t("pdf.sections.mitigation-measures")} (${planData.content.mitigations.items.length})`,
        yPosition + 4,
      );
      yPosition = this.addBulletList(
        doc,
        planData.content.mitigations.items,
        yPosition,
        t,
      );
    }

    // Adaptations
    if (planData.content?.adaptations?.items?.length) {
      yPosition = this.addSection(
        doc,
        `${t("pdf.sections.adaptation-measures")} (${planData.content.adaptations.items.length})`,
        yPosition + 4,
      );
      yPosition = this.addBulletList(
        doc,
        planData.content.adaptations.items,
        yPosition,
        t,
      );
    }

    // SDGs
    if (planData.content?.sdgs?.items?.length) {
      yPosition = this.addSection(
        doc,
        `${t("pdf.sections.sustainable-development-goals")} (${planData.content.sdgs.items.length})`,
        yPosition + 4,
      );
      yPosition = this.addBulletList(
        doc,
        planData.content.sdgs.items,
        yPosition,
        t,
      );
    }

    this.addFooter(doc, t);

    const filename = `action-plan-${actionName.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}-${cityName.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}.pdf`;
    doc.save(filename);
  }
}
