"use client";

import type { TFunction } from "i18next";
import {
  Box,
  Input,
  Text,
  type RadioGroupValueChangeDetails,
} from "@chakra-ui/react";
import { Field } from "@/components/ui/field";
import { Radio, RadioGroup } from "@/components/ui/radio";
import {
  defaultNumberStyleForCountry,
  type ReportedTotalKind,
  type SourceMetadata,
} from "@/util/GHGI/source-metadata";
import { parseNumberString, type NumberStyle } from "@/util/GHGI/source-text";

export type PdfSourceMetadataDraft = {
  numberFormat: NumberStyle;
  numberFormatTouched: boolean;
  totalText: string;
  totalKind: ReportedTotalKind;
};

export function initialPdfSourceMetadataDraft(
  countryCode: string | null,
): PdfSourceMetadataDraft {
  return {
    numberFormat: defaultNumberStyleForCountry(countryCode) ?? "unknown",
    numberFormatTouched: false,
    totalText: "",
    totalKind: "gross",
  };
}

/**
 * With a chosen format the separators are not guessed: european drops dots and
 * reads the comma as decimal, english drops commas. Text that still mixes both
 * (for example "9.559.215,5" read as english) is rejected. A leading "-", "−"
 * (U+2212) or parentheses make the value negative.
 */
function parseTotal(draft: PdfSourceMetadataDraft): number | null {
  let text = draft.totalText.trim().replace(/[   ']/g, "");
  let negative = false;
  const paren = /^\((.*)\)$/.exec(text);
  if (paren) {
    negative = true;
    text = paren[1];
  }
  if (text.startsWith("-") || text.startsWith("−")) {
    // Parentheses and a sign together are ambiguous, not a double negative.
    if (negative) return null;
    negative = true;
    text = text.slice(1);
  }
  let value: number | null;
  if (draft.numberFormat === "european") {
    value = /^[\d.]*\d(,\d+)?$/.test(text)
      ? parseNumberString(text.replace(/\./g, "").replace(",", "."), "english")
      : null;
  } else if (draft.numberFormat === "english") {
    value = /^[\d,]*\d(\.\d+)?$/.test(text)
      ? parseNumberString(text.replace(/,/g, ""), "english")
      : null;
  } else {
    value = parseNumberString(text, "unknown");
  }
  if (value == null || !Number.isFinite(value)) return null;
  return negative ? -value : value;
}

export function draftToSourceMetadata(draft: PdfSourceMetadataDraft): {
  metadata: SourceMetadata;
  errors: "total"[];
} {
  const errors: "total"[] = [];
  const known = draft.numberFormat !== "unknown";

  let reportedTotal: number | null = null;
  if (draft.totalText.trim() !== "") {
    reportedTotal = parseTotal(draft);
    // Zero is no total; only a net total may be negative.
    if (
      reportedTotal == null ||
      reportedTotal === 0 ||
      (reportedTotal < 0 && draft.totalKind !== "net")
    ) {
      reportedTotal = null;
      errors.push("total");
    }
  }

  return {
    metadata: {
      numberFormat: known
        ? (draft.numberFormat as "european" | "english")
        : null,
      numberFormatSource: known
        ? draft.numberFormatTouched
          ? "user"
          : "country_default"
        : null,
      reportedTotal,
      reportedTotalKind: reportedTotal != null ? draft.totalKind : null,
    },
    errors,
  };
}

export function PdfSourceMetadataForm({
  t,
  value,
  onChange,
}: {
  t: TFunction;
  countryCode: string | null;
  value: PdfSourceMetadataDraft;
  onChange: (draft: PdfSourceMetadataDraft) => void;
}) {
  const { metadata, errors } = draftToSourceMetadata(value);
  const preview =
    metadata.reportedTotal != null
      ? t("pdf-reported-total-preview", {
          value: metadata.reportedTotal.toLocaleString("en", {
            maximumFractionDigits: 2,
          }),
        })
      : null;

  return (
    <Box
      w="full"
      mt={4}
      p={4}
      border="1px solid"
      borderColor="border.neutral"
      borderRadius="md"
      display="flex"
      flexDirection="column"
      gap={4}
    >
      <Text fontWeight="semibold" fontSize="body.md">
        {t("pdf-source-metadata-title")}
      </Text>

      <Field label={t("pdf-number-format-label")}>
        <RadioGroup
          value={value.numberFormat}
          onValueChange={(e: RadioGroupValueChangeDetails) =>
            onChange({
              ...value,
              numberFormat: e.value as NumberStyle,
              numberFormatTouched: true,
            })
          }
        >
          <Box display="flex" flexDirection="column" gap={2}>
            {(["european", "english", "unknown"] as const).map((style) => (
              <Radio
                key={style}
                value={style}
                // onValueChange does not fire for the selected value, so a
                // click on it confirms the country default.
                onClick={() => {
                  if (
                    !value.numberFormatTouched &&
                    value.numberFormat === style
                  ) {
                    onChange({ ...value, numberFormatTouched: true });
                  }
                }}
              >
                {t(`pdf-number-format-${style}`)}
              </Radio>
            ))}
          </Box>
        </RadioGroup>
      </Field>

      <Field
        label={t("pdf-reported-total-label")}
        helperText={t("pdf-reported-total-help")}
        invalid={errors.includes("total")}
        errorText={t("pdf-reported-total-invalid")}
      >
        <Input
          inputMode="decimal"
          value={value.totalText}
          onChange={(e) => onChange({ ...value, totalText: e.target.value })}
        />
        {preview && (
          <Text fontSize="body.sm" color="content.secondary">
            {preview}
          </Text>
        )}
        <RadioGroup
          value={value.totalKind}
          onValueChange={(e: RadioGroupValueChangeDetails) =>
            onChange({ ...value, totalKind: e.value as ReportedTotalKind })
          }
        >
          <Box display="flex" gap={6}>
            <Radio value="gross">{t("pdf-reported-total-kind-gross")}</Radio>
            <Radio value="net">{t("pdf-reported-total-kind-net")}</Radio>
          </Box>
        </RadioGroup>
      </Field>
    </Box>
  );
}
