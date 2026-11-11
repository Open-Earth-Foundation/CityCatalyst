"use client";

import type { ReactNode } from "react";
import { TFunction } from "i18next";
import { Badge, Box, Card, HStack, NativeSelect, Text } from "@chakra-ui/react";
import { MdWarning } from "react-icons/md";
import { Button } from "@/components/ui/button";
import type { ImportRowReview } from "@/util/types";
import type { ImportRowDecision } from "./import-row-decisions";
import { scopeFromLabel } from "@/util/GHGI/gpc-ref-resolver";
import { formatTonnes } from "./import-scope-notes";

interface ImportReviewRowsProps {
  t: TFunction;
  fileId: string;
  rows: ImportRowReview[];
  onDecide: (rowIndex: number, decision: ImportRowDecision | null) => void;
}

/** What the user decided on, so the server can tell a stale decision. */
const seen = (row: ImportRowReview, fileId: string) => ({
  decisionFileId: fileId,
  decisionToken: row.decisionToken ?? "",
  decisionRef: row.suggestedRefNo,
  decisionScope: row.scope,
  decisionValue: row.value,
});

function ContextLine({ label, value }: { label: string; value: string }) {
  return (
    <Text fontSize="body.sm" color="content.secondary">
      <Text as="span" fontWeight="medium">
        {label}:
      </Text>{" "}
      {value}
    </Text>
  );
}

function Cell({
  caption,
  children,
}: {
  caption?: string;
  children: ReactNode;
}) {
  return (
    <Box minW={0}>
      {caption && (
        <Text fontSize="body.sm" color="content.tertiary">
          {caption}
        </Text>
      )}
      <Text fontSize="body.md">{children}</Text>
    </Box>
  );
}

/** The row's content, in the order of the scope notes table. */
function RowContent({ t, row }: { t: TFunction; row: ImportRowReview }) {
  const sector = [row.sector, row.subsector].filter(Boolean).join(" > ");
  const shownScope =
    row.scopeOrigin === "reference" ? row.finalScope : row.scope;
  const scopeNumber = scopeFromLabel(shownScope);
  const scopeText =
    scopeNumber != null
      ? t("import-review-scope", { scope: scopeNumber })
      : shownScope?.trim() || null;
  return (
    <Box
      display="grid"
      gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))"
      gap="8px 16px"
    >
      <Cell>
        {row.page != null
          ? t("import-review-page-number", { page: row.page })
          : "—"}
      </Cell>
      <Cell caption={t("import-scope-col-text")}>
        {row.category || row.activityType || "—"}
      </Cell>
      <Cell caption={t("import-scope-col-sector")}>{sector || "—"}</Cell>
      <Cell caption={t("import-scope-col-value")}>
        {row.value != null
          ? formatTonnes(t, row.value)
          : (row.notationKey ?? "—")}
      </Cell>
      <Cell caption={t("import-scope-col-reference")}>
        <Text as="span" fontWeight="medium">
          {row.suggestedRefNo}
        </Text>
      </Cell>
      <Cell caption={t("import-scope-col-scope")}>
        {[
          scopeText,
          t(`import-scope-origin-${row.scopeOrigin}`),
        ]
          .filter(Boolean)
          .join(" · ")}
      </Cell>
    </Box>
  );
}

function SourceContext({ t, row }: { t: TFunction; row: ImportRowReview }) {
  if (!row.quote && !row.source) {
    return (
      <Text fontSize="body.sm" color="content.tertiary">
        {t("import-review-no-context")}
      </Text>
    );
  }
  return (
    <>
      {row.quote && (
        <HStack gap="8px" alignItems="flex-start">
          <Text fontSize="body.sm" color="content.secondary">
            &ldquo;{row.quote}&rdquo;
          </Text>
          {/* Whether the text exists, never whether it justifies the reference. */}
          <Badge colorPalette="gray" flexShrink={0}>
            {t(
              row.quoteFound === null
                ? "import-review-quote-unchecked"
                : row.quoteFound
                  ? "import-review-quote-found"
                  : "import-review-quote-not-found",
            )}
          </Badge>
        </HStack>
      )}
      {row.source && (
        <ContextLine label={t("import-review-table")} value={row.source} />
      )}
    </>
  );
}

/**
 * Rows the import cannot complete without a user decision. Nothing here
 * suggests an answer: the user keeps the reference, chooses another, or skips.
 */
export default function ImportReviewRows({
  t,
  fileId,
  rows,
  onDecide,
}: ImportReviewRowsProps) {
  if (rows.length === 0) return null;
  const pendingCount = rows.filter((row) => !row.decision).length;

  return (
    <Card.Root
      mb={6}
      shadow="none"
      borderWidth="1px"
      borderColor={
        pendingCount > 0 ? "sentiment.warningDefault" : "border.default"
      }
      borderRadius="lg"
      data-testid="import-review-rows"
    >
      <Box p={4}>
        <HStack gap="12px" alignItems="flex-start">
          <MdWarning size={20} />
          <Box>
            <Text fontWeight="semibold" fontSize="body.md">
              {t("import-review-title", { count: pendingCount })}
            </Text>
            <Text fontSize="body.sm" color="content.secondary" mt={1}>
              {t("import-review-description")}
            </Text>
          </Box>
        </HStack>
      </Box>
      {rows.map((row) => (
        <Box
          key={row.rowIndex}
          p={4}
          borderTopWidth="1px"
          borderColor="border.default"
          data-testid="import-review-row"
        >
          <RowContent t={t} row={row} />
          {row.expectedScope != null && (
            <Text fontSize="body.sm" color="sentiment.negativeDefault">
              {t("import-review-conflict", {
                reference: row.suggestedRefNo,
                expected: row.expectedScope,
                stated: row.scope,
              })}
            </Text>
          )}
          <SourceContext t={t} row={row} />
          <HStack gap="8px" mt={3} flexWrap="wrap">
            <Button
              size="sm"
              variant={row.decision === "keep" ? "solid" : "outline"}
              disabled={row.issue === "reference-conflict"}
              onClick={() =>
                onDecide(row.rowIndex, {
                  ...seen(row, fileId),
                  reviewDecision: "keep",
                })
              }
            >
              {t("import-review-keep")}
            </Button>
            <NativeSelect.Root size="sm" w="auto">
              <NativeSelect.Field
                aria-label={t("import-review-reclassify")}
                value={row.decision === "reclassify" ? row.chosenRefNo : ""}
                onChange={(event) =>
                  onDecide(
                    row.rowIndex,
                    event.target.value
                      ? {
                          ...seen(row, fileId),
                          reviewDecision: "reclassify",
                          gpcRefNo: event.target.value,
                        }
                      : null,
                  )
                }
              >
                <option value="">{t("import-review-reclassify")}</option>
                {row.referenceOptions
                  .filter((reference) => reference !== row.suggestedRefNo)
                  .map((reference) => (
                    <option key={reference} value={reference}>
                      {reference}
                    </option>
                  ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
            {row.issue === "reference-conflict" && (
              <NativeSelect.Root size="sm" w="auto">
                <NativeSelect.Field
                  aria-label={t("import-review-change-scope")}
                  value={
                    row.decision === "correct-scope"
                      ? (row.finalScope ?? "")
                      : ""
                  }
                  onChange={(event) =>
                    onDecide(
                      row.rowIndex,
                      event.target.value
                        ? {
                            ...seen(row, fileId),
                            reviewDecision: "correct-scope",
                            scope: event.target.value,
                          }
                        : null,
                    )
                  }
                >
                  <option value="">{t("import-review-change-scope")}</option>
                  {["1", "2", "3"].map((scope) => (
                    <option key={scope} value={scope}>
                      {scope}
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            )}
            <Button
              size="sm"
              variant={row.decision === "skip" ? "solid" : "outline"}
              onClick={() =>
                onDecide(row.rowIndex, {
                  ...seen(row, fileId),
                  reviewDecision: "skip",
                })
              }
            >
              {t("import-review-skip")}
            </Button>
          </HStack>
        </Box>
      ))}
    </Card.Root>
  );
}
