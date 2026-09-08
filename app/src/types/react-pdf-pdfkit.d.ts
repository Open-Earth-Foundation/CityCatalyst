declare module "@react-pdf/pdfkit" {
  interface PdfInfo {
    Creator?: string;
    Producer?: string;
    Subject?: string;
    Title?: string;
  }

  interface PdfMargins {
    bottom: number;
    left: number;
    right: number;
    top: number;
  }

  interface PdfTextOptions {
    indent?: number;
    lineGap?: number;
    paragraphGap?: number;
  }

  type PdfStructureElement = object;

  export default class PDFDocument {
    constructor(options?: {
      autoFirstPage?: boolean;
      displayTitle?: boolean;
      info?: PdfInfo;
      lang?: string;
      margins?: PdfMargins;
      pdfVersion?: string;
      size?: string;
      tagged?: boolean;
    });

    readonly page: { height: number; margins: PdfMargins };
    readonly y: number;

    addPage(): this;
    addStructure(structure: PdfStructureElement): this;
    end(): void;
    font(name: string): this;
    fontSize(size: number): this;
    heightOfString(text: string, options?: PdfTextOptions): number;
    on(event: "data", listener: (chunk: Uint8Array) => void): this;
    on(event: "end", listener: () => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    struct(
      type: string,
      children: PdfStructureElement[] | (() => void),
    ): PdfStructureElement;
    text(text: string, options?: PdfTextOptions): this;
  }
}
