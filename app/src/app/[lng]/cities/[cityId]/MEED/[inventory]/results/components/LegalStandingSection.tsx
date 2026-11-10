"use client";
import React from "react";
import { Box, HStack, VStack } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { BodyMedium, BodySmall } from "@/components/package/Texts/Body";
import { Overline } from "@/components/package/Texts/Overline";
import { MeedStatusTag } from "../../../components/MeedStatusTag";
import {
  LEGAL_CATEGORY_TONE,
  legalCategoryLabelKey,
  type MeedLegalStanding,
} from "../../regulations/legalStanding";
import { DrawerSection } from "./DetailPanel";

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <HStack justifyContent="space-between" alignItems="baseline" gap="s">
      <BodySmall color="content.tertiary">{label}</BodySmall>
      <BodyMedium color="content.primary" textAlign="end">
        {value}
      </BodyMedium>
    </HStack>
  );
}

/**
 * The legal standing of one ranked action, as a drawer section: whether the
 * municipality can act on its own authority, the overall assessment, the legal
 * component of the score, and the justification behind it.
 */
export function LegalStandingSection({
  standing,
  t,
}: {
  standing: MeedLegalStanding | null | undefined;
  /** `meed-results` namespace. */
  t: TFunction;
}) {
  return (
    <DrawerSection
      title={t("detail-legal")}
      tag={
        standing ? (
          <MeedStatusTag tone={LEGAL_CATEGORY_TONE[standing.ownership]}>
            {t(legalCategoryLabelKey(standing.ownership))}
          </MeedStatusTag>
        ) : undefined
      }
    >
      {standing ? (
        <VStack alignItems="stretch" gap="s">
          <Fact
            label={t("detail-legal-verdict")}
            value={t(legalCategoryLabelKey(standing.verdict))}
          />
          {standing.score !== null && (
            <Fact
              label={t("detail-legal-score")}
              value={standing.score.toFixed(2)}
            />
          )}
          {standing.ownershipDescription && (
            <BodySmall color="content.secondary">
              {standing.ownershipDescription}
            </BodySmall>
          )}
          {standing.justification && (
            <Box>
              <Overline color="content.tertiary">
                {t("detail-legal-justification")}
              </Overline>
              <BodySmall color="content.secondary">
                {standing.justification}
              </BodySmall>
            </Box>
          )}
          {standing.references.length > 0 && (
            <Box>
              <Overline color="content.tertiary">
                {t("detail-legal-references")}
              </Overline>
              {standing.references.map((ref, i) => (
                <BodySmall key={i} color="content.secondary">
                  {ref}
                </BodySmall>
              ))}
            </Box>
          )}
        </VStack>
      ) : (
        <BodySmall color="content.secondary">{t("detail-legal-none")}</BodySmall>
      )}
    </DrawerSection>
  );
}
