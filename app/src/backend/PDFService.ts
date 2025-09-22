import puppeteer from "puppeteer";
import { logger } from "@/services/logger";

export interface ActionPlanData {
  metadata?: {
    actionName?: string;
    cityName?: string;
  };
  content?: {
    introduction?: {
      action_description?: string;
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
      }>;
    };
  };
}

export default class PDFService {
  public static async generateActionPlanPDF(
    planData: ActionPlanData,
    cityName: string,
    actionTitle: string,
    lng: string = "en",
  ): Promise<Buffer> {
    let browser;

    try {
      // Launch browser
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      const page = await browser.newPage();

      // Generate HTML content
      const htmlContent = this.generateHTMLTemplate(
        planData,
        cityName,
        actionTitle,
        lng,
      );

      // Set content and generate PDF
      await page.setContent(htmlContent, { waitUntil: "networkidle0" });

      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: {
          top: "1in",
          right: "0.75in",
          bottom: "1in",
          left: "0.75in",
        },
      });

      logger.info("Action plan PDF generated successfully");
      return Buffer.from(pdfBuffer);
    } catch (error) {
      logger.error({ err: error }, "Error generating PDF");
      throw new Error("Failed to generate PDF");
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  private static generateHTMLTemplate(
    planData: ActionPlanData,
    cityName: string,
    actionTitle: string,
    lng: string,
  ): string {
    const translations = this.getTranslations(lng);

    const actionName = planData.metadata?.actionName || actionTitle;
    const overview = planData.content?.introduction?.action_description || "";
    const subactions = planData.content?.subactions?.items || [];
    const institutions = planData.content?.institutions?.items || [];

    return `
<!DOCTYPE html>
<html lang="${lng}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${translations.actionPlan} - ${actionName}</title>
    <style>
        body {
            font-family: 'Arial', sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
        }
        .header {
            background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
            color: white;
            padding: 2rem;
            text-align: center;
            margin-bottom: 2rem;
        }
        .header h1 {
            margin: 0;
            font-size: 2.5rem;
            font-weight: bold;
        }
        .header h2 {
            margin: 0.5rem 0 0 0;
            font-size: 1.5rem;
            opacity: 0.9;
        }
        .header .city {
            font-size: 1.2rem;
            opacity: 0.8;
            margin-top: 1rem;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 0 2rem;
        }
        .section {
            margin-bottom: 2.5rem;
            page-break-inside: avoid;
        }
        .section-title {
            color: #1e40af;
            font-size: 1.5rem;
            font-weight: bold;
            border-bottom: 2px solid #e5e7eb;
            padding-bottom: 0.5rem;
            margin-bottom: 1rem;
        }
        .overview {
            background: #f8fafc;
            padding: 1.5rem;
            border-radius: 8px;
            border-left: 4px solid #3b82f6;
            margin-bottom: 2rem;
        }
        .subactions, .institutions {
            display: grid;
            gap: 1rem;
        }
        .subaction-item, .institution-item {
            background: #f0f9ff;
            margin: 0.5rem 0;
            padding: 1.5rem;
            border-radius: 8px;
            border-left: 4px solid #0ea5e9;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        .subaction-item h4, .institution-item h4 {
            color: #1e40af;
            margin: 0 0 0.5rem 0;
            font-size: 1.1rem;
        }
        .subaction-item p, .institution-item p {
            margin: 0;
            color: #374151;
        }
        .timeline {
            display: grid;
            gap: 1rem;
        }
        .timeline-item {
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 1.5rem;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        .timeline-item h4 {
            color: #1e40af;
            margin: 0 0 0.5rem 0;
            font-size: 1.1rem;
        }
        .timeline-item .duration {
            color: #6b7280;
            font-size: 0.9rem;
            font-weight: bold;
        }
        .resources {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
        }
        .resource-item {
            background: #fef3c7;
            padding: 1.5rem;
            border-radius: 8px;
            border: 1px solid #f59e0b;
        }
        .resource-item h4 {
            color: #92400e;
            margin: 0 0 0.5rem 0;
        }
        .stakeholders {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 0.5rem;
        }
        .stakeholder {
            background: #e0f2fe;
            padding: 0.75rem;
            border-radius: 6px;
            text-align: center;
            border: 1px solid #0891b2;
        }
        .indicators {
            list-style: none;
            padding: 0;
        }
        .indicators li {
            background: #f0fdf4;
            margin: 0.5rem 0;
            padding: 1rem;
            border-radius: 6px;
            border-left: 3px solid #22c55e;
        }
        .challenges {
            list-style: none;
            padding: 0;
        }
        .challenges li {
            background: #fef2f2;
            margin: 0.5rem 0;
            padding: 1rem;
            border-radius: 6px;
            border-left: 3px solid #ef4444;
        }
        .next-steps {
            list-style: none;
            padding: 0;
        }
        .next-steps li {
            background: #f5f3ff;
            margin: 0.5rem 0;
            padding: 1rem;
            border-radius: 6px;
            border-left: 3px solid #8b5cf6;
            position: relative;
        }
        .next-steps li::before {
            content: "→";
            color: #8b5cf6;
            font-weight: bold;
            margin-right: 0.5rem;
        }
        .footer {
            margin-top: 3rem;
            padding: 2rem;
            background: #f8fafc;
            text-align: center;
            color: #6b7280;
            border-top: 1px solid #e5e7eb;
        }
        @page {
            margin: 1in 0.75in;
        }
        @media print {
            .header {
                page-break-after: avoid;
            }
            .section {
                page-break-inside: avoid;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${translations.actionPlan}</h1>
        <h2>${actionName}</h2>
        <div class="city">${cityName}</div>
    </div>
    
    <div class="container">
        ${
          overview
            ? `
        <div class="overview">
            <h3>${translations.overview}</h3>
            <p>${overview}</p>
        </div>
        `
            : ""
        }
        
        ${
          subactions.length > 0
            ? `
        <div class="section">
            <h3 class="section-title">${translations.subactions} (${subactions.length})</h3>
            <div class="subactions">
                ${subactions
                  .map(
                    (subaction) => `
                    <div class="subaction-item">
                        <h4>${subaction.number}. ${subaction.title}</h4>
                        <p>${subaction.description}</p>
                    </div>
                `,
                  )
                  .join("")}
            </div>
        </div>
        `
            : ""
        }
        
        ${
          institutions.length > 0
            ? `
        <div class="section">
            <h3 class="section-title">${translations.institutions} (${institutions.length})</h3>
            <div class="institutions">
                ${institutions
                  .map(
                    (institution) => `
                    <div class="institution-item">
                        <h4>${institution.name}</h4>
                        <p>${institution.description}</p>
                    </div>
                `,
                  )
                  .join("")}
            </div>
        </div>
        `
            : ""
        }
    </div>
    
    <div class="footer">
        <p>${translations.generatedBy} CityCatalyst • ${new Date().toLocaleDateString(lng)}</p>
    </div>
</body>
</html>`;
  }

  private static getTranslations(lng: string): Record<string, string> {
    const translations: Record<string, Record<string, string>> = {
      en: {
        actionPlan: "Climate Action Plan",
        overview: "Overview",
        subactions: "Sub-actions",
        institutions: "Municipal Institutions Involved",
        generatedBy: "Generated by",
      },
      fr: {
        actionPlan: "Plan d'Action Climatique",
        overview: "Aperçu",
        subactions: "Sous-actions",
        institutions: "Institutions Municipales Impliquées",
        generatedBy: "Généré par",
      },
      es: {
        actionPlan: "Plan de Acción Climática",
        overview: "Resumen",
        subactions: "Subacciones",
        institutions: "Instituciones Municipales Involucradas",
        generatedBy: "Generado por",
      },
      de: {
        actionPlan: "Klimaschutz-Aktionsplan",
        overview: "Überblick",
        subactions: "Unteraktionen",
        institutions: "Beteiligte Städtische Institutionen",
        generatedBy: "Generiert von",
      },
      pt: {
        actionPlan: "Plano de Ação Climática",
        overview: "Visão Geral",
        subactions: "Subações",
        institutions: "Instituições Municipais Envolvidas",
        generatedBy: "Gerado por",
      },
    };

    return translations[lng] || translations.en;
  }
}
