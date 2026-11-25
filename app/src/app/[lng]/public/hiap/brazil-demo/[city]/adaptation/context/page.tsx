"use client";
import React from "react";
import { Card } from "@chakra-ui/react";
import { DemoShell } from "../../../_components/DemoShell";
import { cityFromSlug } from "../../../_lib/useTrack";
import { useDemoT } from "../../../_lib/useDemoT";
import { SCREEN_IDS } from "../../../_lib/hrefs";
import { CityContextBody } from "../../../_components/next/CityContextDialog";

/**
 * BR-N10 — proposal: the city context as a page, the same content as the
 * dialog the home opens on demand. Shown, never scored. Indicators stay as
 * measured figures with their source: they describe the city, they do not
 * assess an action, so they take no level colour.
 */
export default function Page(props: {
  params: Promise<{ lng: string; city: string }>;
}) {
  const { lng, city: slug } = React.use(props.params);
  const city = cityFromSlug(slug);
  const { t } = useDemoT(lng);
  return (
    <DemoShell
      lng={lng}
      city={city}
      track="adaptation"
      segment="context"
      screenId={SCREEN_IDS.next.context}
      title={t("context-title")}
      description={t("context-intro")}
      backLabel={t("back-to-home")}
      openPoints={[t("next-notice-proposal")]}
    >
      <Card.Root borderColor="border.overlay">
        <Card.Body p="l">
          <CityContextBody city={city} lng={lng} t={t} outlineSize={180} />
        </Card.Body>
      </Card.Root>
    </DemoShell>
  );
}
