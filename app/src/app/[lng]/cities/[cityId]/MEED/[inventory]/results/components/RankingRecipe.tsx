"use client";
import React from "react";
import { Link } from "@chakra-ui/react";
import NextLink from "next/link";
import type { TFunction } from "i18next";
import { Trans } from "react-i18next";
import { BodyMedium } from "@/components/package/Texts/Body";
import { FOCUS_RING } from "../../../focusRing";
import type { MeedScoreWeights } from "./rankingFacts";
import { hasCustomWeights } from "../../../components/MeedRankingBasis";
import {
  hasStoredPreferences,
  useMeedStoredPreferences,
} from "../../../components/useMeedStoredPreferences";

/** An inline link inside the sentence: body font, link colour, no icon. */
function A({ href, children }: { href: string; children?: React.ReactNode }) {
  return (
    <Link
      asChild
      color="content.link"
      fontWeight="semibold"
      _focusVisible={FOCUS_RING}
    >
      <NextLink href={href}>{children}</NextLink>
    </Link>
  );
}

/**
 * One sentence on how the ranking was built, with the five assessments as
 * inline links. That is the whole explanation; the detail lives on each
 * assessment's page.
 */
export function RankingRecipe({
  inventoryId,
  weights,
  hrefFor,
  editHref,
  t,
}: {
  inventoryId: string;
  weights: MeedScoreWeights | null;
  /** Href of an assessment page by its route segment. */
  hrefFor: (segment: string) => string;
  /** Where "preferences" leads. */
  editHref: string;
  /** `meed-results` namespace. */
  t: TFunction;
}) {
  const { prefs, exclusions } = useMeedStoredPreferences(inventoryId);
  const custom =
    hasStoredPreferences(prefs, exclusions) || hasCustomWeights(weights);
  return (
    <BodyMedium color="content.secondary">
      <Trans
        t={t}
        i18nKey={custom ? "recipe-sentence-custom" : "recipe-sentence"}
        components={{
          emissions: <A href={hrefFor("emissions")} />,
          context: <A href={hrefFor("context")} />,
          legal: <A href={hrefFor("regulations")} />,
          finance: <A href={hrefFor("finance")} />,
          policy: <A href={hrefFor("policy")} />,
          preferences: <A href={editHref} />,
        }}
      />
    </BodyMedium>
  );
}
