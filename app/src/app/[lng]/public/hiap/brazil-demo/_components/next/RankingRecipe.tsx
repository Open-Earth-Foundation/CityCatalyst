"use client";
import React from "react";
import { Link } from "@chakra-ui/react";
import NextLink from "next/link";
import type { TFunction } from "i18next";
import { Trans } from "react-i18next";
import { BodyMedium } from "@/components/package/Texts/Body";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import type { TrackData } from "../../_lib/useTrack";
import { trackHref } from "../../_lib/hrefs";
import { DEMO_NS } from "../../_lib/useDemoT";

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
 * One sentence on how the ranking on BR-N1 was built, with the four
 * assessments as inline links. That is the whole explanation above the
 * fold; the detail lives on the assessment pages.
 */
export function RankingRecipe({
  lng,
  data,
  hasPreferences,
  t,
}: {
  lng: string;
  data: TrackData;
  hasPreferences: boolean;
  t: TFunction;
}) {
  const { city } = data;
  const href = (segment: string) =>
    trackHref(lng, city.slug, "adaptation", segment);
  return (
    <BodyMedium color="content.secondary">
      <Trans
        t={t}
        ns={DEMO_NS}
        i18nKey={
          hasPreferences
            ? "next-recipe-sentence-custom"
            : "next-recipe-sentence"
        }
        values={{ city: city.name }}
        components={{
          risk: <A href={href("risk")} />,
          legal: <A href={href("next/legal")} />,
          finance: <A href={href("finance")} />,
          policy: <A href={href("policy")} />,
        }}
      />
    </BodyMedium>
  );
}
