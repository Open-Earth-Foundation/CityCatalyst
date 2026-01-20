import Excel from "exceljs";
import { parse } from "csv-parse";
import { Readable } from "stream";

export interface ParsedSheet {
  name: string;
  headers: string[];
  rows: Record<string, any>[];
  rowCount: number;
  columnCount: number;
}

export interface ParsedFileData {
  sheets: ParsedSheet[];
  primarySheet?: ParsedSheet; // The main data sheet (eCRF_3 for eCRF files)
  fileType: "xlsx" | "csv";
}

/**
 * File Parser Service for inventory import files
 * Parses XLSX and CSV files and extracts structured data
 */
export default class FileParserService {
  /**
   * Parse an XLSX file from a buffer
   * @param buffer - File buffer
   * @returns ParsedFileData with sheets and data
   */
  public static async parseXLSX(buffer: Buffer): Promise<ParsedFileData> {
    const workbook = new Excel.Workbook();
    await workbook.xlsx.load(buffer as any);

    const sheets: ParsedSheet[] = [];

    workbook.worksheets.forEach((worksheet) => {
      const headers: string[] = [];
      const rows: Record<string, any>[] = [];

      // Get headers from first row
      const headerRow = worksheet.getRow(1);
      headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const headerValue = cell.value?.toString() || `Column ${colNumber}`;
        headers[colNumber] = headerValue;
      });

      // Parse data rows (starting from row 2)
      for (let rowNum = 2; rowNum <= worksheet.rowCount; rowNum++) {
        const row = worksheet.getRow(rowNum);
        const rowData: Record<string, any> = {};

        headers.forEach((header, colNumber) => {
          if (header) {
            const cell = row.getCell(colNumber);
            rowData[header] = cell.value ?? null;
          }
        });

        // Only add row if it has at least one non-null value
        if (Object.values(rowData).some((val) => val !== null && val !== "")) {
          rows.push(rowData);
        }
      }

      sheets.push({
        name: worksheet.name,
        headers: headers.filter(Boolean),
        rows,
        rowCount: worksheet.rowCount,
        columnCount: worksheet.columnCount,
      });
    });

    // Identify primary sheet (eCRF_3 for eCRF files, or first sheet with data for others)
    const primarySheet =
      sheets.find((s) => s.name.toLowerCase().includes("ecrf_3")) ||
      sheets.find((s) => s.rows.length > 0) ||
      sheets[0];

    return {
      sheets,
      primarySheet,
      fileType: "xlsx",
    };
  }

  /**
   * Parse a CSV file from a buffer
   * @param buffer - File buffer
   * @returns ParsedFileData with single sheet
   */
  public static async parseCSV(buffer: Buffer): Promise<ParsedFileData> {
    return new Promise((resolve, reject) => {
      const rows: Record<string, any>[] = [];
      let headers: string[] = [];

      const stream = Readable.from(buffer.toString("utf-8"));
      const parser = stream.pipe(
        parse({
          columns: true, // Use first line as column names
          skip_empty_lines: true,
          trim: true,
        }),
      );

      parser.on("readable", () => {
        let record;
        while ((record = parser.read()) !== null) {
          if (headers.length === 0 && Object.keys(record).length > 0) {
            headers = Object.keys(record);
          }
          rows.push(record);
        }
      });

      parser.on("error", (error) => {
        reject(error);
      });

      parser.on("end", () => {
        const sheet: ParsedSheet = {
          name: "Sheet1",
          headers,
          rows,
          rowCount: rows.length + 1, // +1 for header row
          columnCount: headers.length,
        };

        resolve({
          sheets: [sheet],
          primarySheet: sheet,
          fileType: "csv",
        });
      });
    });
  }

  /**
   * Parse a file based on its type
   * @param buffer - File buffer
   * @param fileType - File type (xlsx or csv)
   * @returns ParsedFileData
   */
  public static async parseFile(
    buffer: Buffer,
    fileType: "xlsx" | "csv",
  ): Promise<ParsedFileData> {
    if (fileType === "xlsx") {
      return this.parseXLSX(buffer);
    } else {
      return this.parseCSV(buffer);
    }
  }

  /**
   * Detect column index by name (case-insensitive, fuzzy matching)
   * Prioritizes exact matches and longer/more specific terms
   * @param headers - Array of header strings
   * @param searchTerms - Array of search terms to match (in priority order)
   * @returns Column index if found, -1 otherwise
   */
  public static detectColumn(headers: string[], searchTerms: string[]): number {
    const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());
    const normalizedSearchTerms = searchTerms.map((t) =>
      t.toLowerCase().trim(),
    );

    // First pass: Look for exact matches (highest priority)
    for (let i = 0; i < normalizedHeaders.length; i++) {
      const header = normalizedHeaders[i];
      for (const term of normalizedSearchTerms) {
        // Exact match has highest priority
        if (header === term) {
          return i;
        }
      }
    }

    // Second pass: Look for contains matches, prioritizing longer/more specific terms
    // Sort terms by length (longest first) to prioritize more specific matches
    const sortedTerms = [...normalizedSearchTerms].sort(
      (a, b) => b.length - a.length,
    );

    for (const term of sortedTerms) {
      for (let i = 0; i < normalizedHeaders.length; i++) {
        const header = normalizedHeaders[i];
        // Prefer matches where the term is contained in the header (more specific)
        if (header.includes(term)) {
          // Exclude "emission factor" columns when looking for total CO2e
          if (
            term.includes("total co2e") &&
            header.includes("emission factor") &&
            !header.includes("ghgs")
          ) {
            continue; // Skip emission factor columns for total CO2e
          }
          return i;
        }
      }
    }

    // Third pass: Fallback to reverse contains (term contains header)
    for (let i = 0; i < normalizedHeaders.length; i++) {
      const header = normalizedHeaders[i];
      for (const term of sortedTerms) {
        if (term.includes(header)) {
          return i;
        }
      }
    }

    return -1;
  }

  /**
   * Get column value from a row by column index
   * @param row - Row data object
   * @param headers - Array of headers
   * @param columnIndex - Column index
   * @returns Column value or null
   */
  public static getColumnValue(
    row: Record<string, any>,
    headers: string[],
    columnIndex: number,
  ): any {
    if (columnIndex < 0 || columnIndex >= headers.length) {
      return null;
    }
    const header = headers[columnIndex];
    return row[header] ?? null;
  }
}
