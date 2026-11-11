"use client";

import { useState } from "react";
import { TFunction } from "i18next";
import { Box, Card, Icon, Table, Text } from "@chakra-ui/react";
import { MdInfoOutline, MdWarning } from "react-icons/md";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import type { ImportScopeNoteRow, ScopeOrigin } from "@/util/types";

const COLLAPSED_ROW_LIMIT = 10;

interface ImportScopeNotesProps {
  t: TFunction;
  warnings: ImportScopeNoteRow[];
  inferred: ImportScopeNoteRow[];
}

/** Where the scope on an import row came from, in words. */
export function ScopeOriginLabel({
  t,
  origin,
}: {
  t: TFunction;
  origin: ScopeOrigin;
}) {
  return <>{t(`import-scope-origin-${origin}`)}</>;
}

function dash(value: string | null | undefined) {
  return value ? value : "—";
}

function inferredTooltip(t: TFunction, row: ImportScopeNoteRow): string {
  if (row.scopeOrigin === "not-applicable") {
    return t("import-inferred-scope-row-not-applicable", {
      row: row.rowNumber,
      ref: row.gpcRefNo,
    });
  }
  const values = {
    row: row.rowNumber,
    ref: row.gpcRefNo,
    scope: row.scope ?? t("import-scope-missing"),
    origin: t(`import-scope-source-${row.scopeOrigin}`),
    originalScope: row.originalScope,
  };
  return row.originalScope
    ? t("import-inferred-scope-row-overridden", values)
    : t("import-inferred-scope-row", values);
}

function ScopeNotesCard({
  t,
  rows,
  tone,
}: {
  t: TFunction;
  rows: ImportScopeNoteRow[];
  tone: "warning" | "info";
}) {
  const [showAll, setShowAll] = useState(false);
  // A t bound to a language carries it as `lng`.
  const lng = (t as unknown as { lng?: string }).lng ?? "en";
  const visibleRows = showAll ? rows : rows.slice(0, COLLAPSED_ROW_LIMIT);
  const isWarning = tone === "warning";

  return (
    <Card.Root
      mb={6}
      shadow="none"
      borderWidth="1px"
      borderColor="border.default"
      borderRadius="lg"
      overflow="hidden"
      data-testid={
        isWarning ? "import-scope-warnings" : "import-inferred-scope"
      }
    >
      <Box display="flex" alignItems="flex-start" gap="12px" p={4}>
        {isWarning && (
          <Icon
            as={MdWarning}
            boxSize={5}
            color="sentiment.warningDefault"
            mt="2px"
            flexShrink={0}
          />
        )}
        <Text
          fontSize="body.md"
          fontWeight={isWarning ? "semibold" : "normal"}
          color={isWarning ? undefined : "content.secondary"}
        >
          {t(
            isWarning
              ? "import-scope-warning-summary"
              : "import-inferred-scope-summary",
            { count: rows.length },
          )}
        </Text>
      </Box>
      <Table.Root size="sm">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>
              {t("import-scope-col-page")}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("import-scope-col-text")}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("import-scope-col-sector")}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("import-scope-col-value")}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("import-scope-col-reference")}
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              {t("import-scope-col-scope")}
            </Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {visibleRows.map((row) => {
            const sector = [row.sector, row.subsector]
              .filter(Boolean)
              .join(" > ");
            const tooltip = isWarning ? null : inferredTooltip(t, row);
            return (
              <Table.Row key={row.rowNumber}>
                <Table.Cell>{row.page ?? "—"}</Table.Cell>
                <Table.Cell>{dash(row.text)}</Table.Cell>
                <Table.Cell>{dash(sector)}</Table.Cell>
                <Table.Cell>
                  {row.value === null
                    ? "—"
                    : `${row.value.toLocaleString(lng)} tCO2e`}
                </Table.Cell>
                <Table.Cell>
                  <Text fontWeight="medium">{row.gpcRefNo}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Box display="flex" alignItems="center" gap="4px">
                    <Box>
                      {(row.scope !== null || isWarning) && (
                        <Text>{row.scope || t("import-scope-missing")}</Text>
                      )}
                      {!isWarning && (
                        <Text fontSize="body.sm" color="content.secondary">
                          <ScopeOriginLabel t={t} origin={row.scopeOrigin} />
                        </Text>
                      )}
                    </Box>
                    {tooltip && (
                      <Tooltip content={tooltip} showArrow>
                        <Icon
                          as={MdInfoOutline}
                          boxSize={4}
                          color="content.tertiary"
                          // Focusable so keyboard users can open the tooltip.
                          tabIndex={0}
                          role="img"
                          aria-label={tooltip}
                        />
                      </Tooltip>
                    )}
                  </Box>
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>
      {rows.length > COLLAPSED_ROW_LIMIT && (
        <Box p={3}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAll((value) => !value)}
          >
            {showAll
              ? t("import-rows-show-less")
              : t("import-rows-show-all", { count: rows.length })}
          </Button>
        </Box>
      )}
    </Card.Root>
  );
}

/**
 * Scope notes for the import preview: rows whose scope we could not work out
 * (warning card) and rows whose scope was not read from the document
 * (information card), each as a table of the row's content.
 */
export default function ImportScopeNotes({
  t,
  warnings,
  inferred,
}: ImportScopeNotesProps) {
  if (warnings.length === 0 && inferred.length === 0) return null;
  return (
    <>
      {warnings.length > 0 && (
        <ScopeNotesCard t={t} rows={warnings} tone="warning" />
      )}
      {inferred.length > 0 && (
        <ScopeNotesCard t={t} rows={inferred} tone="info" />
      )}
    </>
  );
}
