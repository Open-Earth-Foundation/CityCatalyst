import Excel from "exceljs";
import { parse } from "csv-parse";
import { Readable } from "stream";
import {
  cirisMissingEcrf3,
  cirisSheetsToParse,
  filterSpreadsheetToSheets,
  isCirisSheetList,
  listSpreadsheetSheetNames,
  preferEcrf3SheetName,
  sheetNameLooksLikeEcrf3,
} from "@/backend/ciris-workbook";
import { logger } from "@/services/logger";

export interface ParsedSheet {
  name: string;
  headers: string[];
  rows: Record<string, string | number | null>[];
  /** 1-based row number in the source file for each entry in `rows` (xlsx only). */
  rowNumbers?: number[];
  rowCount: number;
  columnCount: number;
}

export interface ParsedFileData {
  sheets: ParsedSheet[];
  primarySheet?: ParsedSheet; // The main data sheet (eCRF_3 for eCRF files)
  fileType: "xlsx" | "csv";
  /** All worksheet names in the source package before selective load. */
  sourceSheetNames?: string[];
  /** CIRIS/CDP multi-sheet workbook (eCRF_3 + helper tabs). */
  isCIRIS?: boolean;
}

/**
 * File Parser Service for inventory import files
 * Parses XLSX and CSV files and extracts structured data
 */
export default class FileParserService {
  /**
   * Parse an XLSX/XLSM file from a buffer.
   * CIRIS workbooks only materialize eCRF_3 (+ Report/Overview) so ExcelJS
   * does not expand the full ~53-sheet template into memory.
   */
  public static async parseXLSX(buffer: Buffer): Promise<ParsedFileData> {
    let loadBuffer = buffer;
    let sourceSheetNames: string[] | undefined;
    let isCIRIS = false;

    try {
      sourceSheetNames = await listSpreadsheetSheetNames(buffer);
      isCIRIS =
        isCirisSheetList(sourceSheetNames) ||
        cirisMissingEcrf3(sourceSheetNames);
      if (isCIRIS) {
        const keep = cirisSheetsToParse(sourceSheetNames);
        if (keep.length > 0) {
          loadBuffer = await filterSpreadsheetToSheets(buffer, keep);
          logger.info(
            {
              ingest: true,
              sheetCount: sourceSheetNames.length,
              keptSheets: keep,
            },
            "[ciris] selective sheet parse",
          );
        }
      }
    } catch (error) {
      logger.warn(
        { err: error },
        "[ciris] selective sheet filter failed; loading full workbook",
      );
    }

    const workbook = new Excel.Workbook();
    // exceljs's Buffer type comes from a different @types/node snapshot than
    // this project's, so the two Buffer types don't structurally match.
    await workbook.xlsx.load(
      loadBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );

    const sheets: ParsedSheet[] = [];

    workbook.worksheets.forEach((worksheet) => {
      const headers: string[] = [];
      const rows: Record<string, string | number | null>[] = [];
      const rowNumbers: number[] = [];

      // Get headers from first row. CIRIS eCRF_3 repeats Fuel/Notation/GHG
      // headers after its helper block — keep the first occurrence only so
      // mapping UI and row objects do not show duplicate fields.
      const headerRow = worksheet.getRow(1);
      let maxCol = 0;
      const seenHeaders = new Set<string>();
      headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const headerValue = cell.value?.toString() || `Column ${colNumber}`;
        maxCol = Math.max(maxCol, colNumber);
        if (seenHeaders.has(headerValue)) return;
        seenHeaders.add(headerValue);
        headers[colNumber] = headerValue;
      });

      // exceljs rowCount follows the template dimension (eCRF_3 goes to ~500).
      // Stop at the last row that actually has a cell, but keep empty rows
      // between the header and that last row so Excel numbering stays aligned.
      let lastUsedRow = 1;
      worksheet.eachRow({ includeEmpty: false }, (row) => {
        lastUsedRow = Math.max(lastUsedRow, row.number);
        row.eachCell({ includeEmpty: false }, (_cell, colNumber) => {
          maxCol = Math.max(maxCol, colNumber);
        });
      });

      // CIRIS Report/Overview sheets have sparse/empty header rows; still keep
      // numeric total cells under stable Column N keys. Do not invent headers
      // for eCRF_3 (would surface as unmapped Column N in the mapping UI).
      const synthesizeMissingHeaders =
        !sheetNameLooksLikeEcrf3(worksheet.name) &&
        (/^report$/i.test(worksheet.name) ||
          /^results_overview$/i.test(worksheet.name));
      if (synthesizeMissingHeaders) {
        for (let col = 1; col <= maxCol; col++) {
          if (!headers[col]) headers[col] = `Column ${col}`;
        }
      }

      // Data starts at Excel row 2 (row 1 is the header; exceljs is 1-based).
      for (let rowNum = 2; rowNum <= lastUsedRow; rowNum++) {
        const row = worksheet.getRow(rowNum);
        const rowData: Record<string, string | number | null> = {};

        if (synthesizeMissingHeaders) {
          for (let colNumber = 1; colNumber <= maxCol; colNumber++) {
            const header = headers[colNumber];
            if (!header) continue;
            rowData[header] = this.normalizeCellValue(
              row.getCell(colNumber).value,
            );
          }
        } else {
          headers.forEach((header, colNumber) => {
            if (header) {
              rowData[header] = this.normalizeCellValue(
                row.getCell(colNumber).value,
              );
            }
          });
        }

        rows.push(rowData);
        rowNumbers.push(rowNum);
      }

      sheets.push({
        name: worksheet.name,
        headers: headers.filter(Boolean),
        rows,
        rowNumbers,
        rowCount: lastUsedRow,
        columnCount: Math.max(worksheet.columnCount, maxCol),
      });
    });

    // Prefer exact eCRF_3 over Light_eCRF_3 (includes() matched Light first).
    const preferredName = preferEcrf3SheetName(sheets.map((s) => s.name));
    const primarySheet =
      (preferredName
        ? sheets.find((s) => s.name === preferredName)
        : undefined) ||
      sheets.find((s) => sheetNameLooksLikeEcrf3(s.name)) ||
      sheets.find((s) => s.rows.length > 0) ||
      sheets[0];

    return {
      sheets,
      primarySheet,
      fileType: "xlsx",
      sourceSheetNames,
      isCIRIS: isCIRIS || undefined,
    };
  }

  /**
   * Normalize cell value to string, number, or null so we never store objects (avoids [object Object]
   * when cells contain formula errors like #REF! or rich text objects).
   */
  private static normalizeCellValue(value: unknown): string | number | null {
    if (value == null) return null;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") return value;
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "object") {
      const o = value as Record<string, unknown>;
      if (typeof o.error === "string" && o.error)
        return `#${o.error.toUpperCase()}!`;
      if (typeof o.result !== "undefined")
        return this.normalizeCellValue(o.result) ?? null;
      if (typeof o.richText === "string") return o.richText;
      if (Array.isArray(o.richText)) {
        const text = (o.richText as { text?: string }[])
          .map((t) => t.text)
          .filter(Boolean)
          .join("");
        if (text) return text;
      }
    }
    return null;
  }

  /**
   * Parse a CSV file from a buffer
   * @param buffer - File buffer
   * @returns ParsedFileData with single sheet
   */
  public static async parseCSV(buffer: Buffer): Promise<ParsedFileData> {
    return new Promise((resolve, reject) => {
      const rows: Record<string, string | number | null>[] = [];
      let headers: string[] = [];

      const stream = Readable.from(buffer.toString("utf-8"));
      const parser = stream.pipe(
        parse({
          columns: true, // Use first line as column names
          skip_empty_lines: false,
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
    fileType: "xlsx" | "csv" | "pdf",
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

    // Third pass: reverse contains (term contains header). Require a
    // substantial header so short gas names like "co2" do not match
    // "emission factor - co2" / "ef co2" and steal EF column bindings.
    for (let i = 0; i < normalizedHeaders.length; i++) {
      const header = normalizedHeaders[i];
      if (header.length < 4) {
        continue;
      }
      for (const term of sortedTerms) {
        if (!term.includes(header)) {
          continue;
        }
        // Emission-factor terms must only reverse-match EF-looking headers
        if (
          (term.includes("emission factor") ||
            term.startsWith("ef ") ||
            term.startsWith("ef_")) &&
          !header.includes("emission factor") &&
          !header.startsWith("ef ") &&
          !header.startsWith("ef_") &&
          !/^ef[\s_-]/.test(header)
        ) {
          continue;
        }
        return i;
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
    row: Record<string, string | number | null>,
    headers: string[],
    columnIndex: number,
  ): string | number | null {
    if (columnIndex < 0 || columnIndex >= headers.length) {
      return null;
    }
    const header = headers[columnIndex];
    return row[header] ?? null;
  }
}
