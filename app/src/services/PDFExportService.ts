import jsPDF from "jspdf";
import "jspdf-autotable";

interface ActionPlanPDFData {
  metadata?: {
    cityName?: string;
    actionName?: string;
    language?: string;
    createdAt?: string;
  };
  content?: {
    introduction?: {
      city_description?: string;
      action_description?: string;
      national_strategy_explanation?: string;
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

export class PDFExportService {
  private static addHeader(doc: jsPDF, cityName: string, actionName: string) {
    // Add title
    doc.setFontSize(20);
    doc.setFont(undefined, "bold");
    doc.text("Climate Action Implementation Plan", 20, 25);

    // Add subtitle
    doc.setFontSize(16);
    doc.setFont(undefined, "normal");
    doc.text(`${actionName} - ${cityName}`, 20, 35);

    // Add divider line
    doc.setLineWidth(0.5);
    doc.line(20, 45, 190, 45);

    return 55; // Return Y position for next content
  }

  private static addSection(
    doc: jsPDF,
    title: string,
    yPosition: number,
    maxWidth: number = 170,
  ): number {
    // Check if we need a new page
    if (yPosition > 250) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(14);
    doc.setFont(undefined, "bold");
    doc.text(title, 20, yPosition);

    // Add underline
    const textWidth = doc.getTextWidth(title);
    doc.setLineWidth(0.3);
    doc.line(20, yPosition + 2, 20 + textWidth, yPosition + 2);

    return yPosition + 12;
  }

  private static addText(
    doc: jsPDF,
    text: string,
    yPosition: number,
    maxWidth: number = 170,
  ): number {
    if (!text) return yPosition;

    // Check if we need a new page
    if (yPosition > 270) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(11);
    doc.setFont(undefined, "normal");

    // Split text to fit width
    const lines = doc.splitTextToSize(text, maxWidth);
    doc.text(lines, 20, yPosition);

    return yPosition + lines.length * 5 + 8;
  }

  private static addNumberedList(
    doc: jsPDF,
    items: Array<{ number?: number; title: string; description: string }>,
    yPosition: number,
  ): number {
    let currentY = yPosition;

    items.forEach((item, index) => {
      // Check if we need a new page
      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
      }

      // Add number and title
      doc.setFontSize(11);
      doc.setFont(undefined, "bold");
      const numberText = `${item.number || index + 1}. ${item.title}`;
      doc.text(numberText, 25, currentY);
      currentY += 7;

      // Add description
      doc.setFont(undefined, "normal");
      const descLines = doc.splitTextToSize(item.description, 165);
      doc.text(descLines, 25, currentY);
      currentY += descLines.length * 5 + 8;
    });

    return currentY;
  }

  private static addBulletList(
    doc: jsPDF,
    items: Array<{ title?: string; name?: string; description: string }>,
    yPosition: number,
  ): number {
    let currentY = yPosition;

    items.forEach((item) => {
      // Check if we need a new page
      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
      }

      // Add bullet and title
      doc.setFontSize(11);
      doc.setFont(undefined, "bold");
      const titleText = `• ${item.title || item.name || "Item"}`;
      doc.text(titleText, 25, currentY);
      currentY += 7;

      // Add description
      doc.setFont(undefined, "normal");
      const descLines = doc.splitTextToSize(item.description, 165);
      doc.text(descLines, 25, currentY);
      currentY += descLines.length * 5 + 8;
    });

    return currentY;
  }

  public static generateActionPlanPDF(
    planData: ActionPlanPDFData,
    actionName: string,
    cityName: string,
  ): void {
    const doc = new jsPDF();

    // Add header
    let yPosition = this.addHeader(doc, cityName, actionName);

    // Add introduction section
    if (planData.content?.introduction) {
      yPosition = this.addSection(doc, "Overview", yPosition + 10);

      if (planData.content.introduction.city_description) {
        yPosition = this.addText(
          doc,
          `City Context: ${planData.content.introduction.city_description}`,
          yPosition,
        );
      }

      if (planData.content.introduction.action_description) {
        yPosition = this.addText(
          doc,
          `Action Description: ${planData.content.introduction.action_description}`,
          yPosition,
        );
      }

      if (planData.content.introduction.national_strategy_explanation) {
        yPosition = this.addText(
          doc,
          `National Strategy: ${planData.content.introduction.national_strategy_explanation}`,
          yPosition,
        );
      }
    }

    // Add subactions
    if (planData.content?.subactions?.items?.length) {
      yPosition = this.addSection(
        doc,
        `Implementation Steps (${planData.content.subactions.items.length})`,
        yPosition + 10,
      );
      yPosition = this.addNumberedList(
        doc,
        planData.content.subactions.items,
        yPosition,
      );
    }

    // Add institutions
    if (planData.content?.institutions?.items?.length) {
      yPosition = this.addSection(
        doc,
        `Key Institutions (${planData.content.institutions.items.length})`,
        yPosition + 10,
      );
      yPosition = this.addBulletList(
        doc,
        planData.content.institutions.items,
        yPosition,
      );
    }

    // Add milestones
    if (planData.content?.milestones?.items?.length) {
      yPosition = this.addSection(
        doc,
        `Milestones (${planData.content.milestones.items.length})`,
        yPosition + 10,
      );
      yPosition = this.addNumberedList(
        doc,
        planData.content.milestones.items,
        yPosition,
      );
    }

    // Add mitigations
    if (planData.content?.mitigations?.items?.length) {
      yPosition = this.addSection(
        doc,
        `Mitigation Measures (${planData.content.mitigations.items.length})`,
        yPosition + 10,
      );
      yPosition = this.addBulletList(
        doc,
        planData.content.mitigations.items,
        yPosition,
      );
    }

    // Add adaptations
    if (planData.content?.adaptations?.items?.length) {
      yPosition = this.addSection(
        doc,
        `Adaptation Measures (${planData.content.adaptations.items.length})`,
        yPosition + 10,
      );
      yPosition = this.addBulletList(
        doc,
        planData.content.adaptations.items,
        yPosition,
      );
    }

    // Add SDGs
    if (planData.content?.sdgs?.items?.length) {
      yPosition = this.addSection(
        doc,
        `Sustainable Development Goals (${planData.content.sdgs.items.length})`,
        yPosition + 10,
      );
      yPosition = this.addBulletList(
        doc,
        planData.content.sdgs.items,
        yPosition,
      );
    }

    // Add footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont(undefined, "normal");
      doc.text(
        `Generated by CityCatalyst - Page ${i} of ${pageCount}`,
        20,
        285,
      );
      doc.text(`Generated on ${new Date().toLocaleDateString()}`, 150, 285);
    }

    // Generate filename and download
    const filename = `action-plan-${actionName.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}-${cityName.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}.pdf`;
    doc.save(filename);
  }
}
