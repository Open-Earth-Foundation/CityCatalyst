"use client";
import { Box, HStack, Icon, Tabs } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { AdaptationTabIcon, MitigationTabIcon } from "@/components/icons";
import { MeedStatusTag } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import { trackHref } from "../_lib/hrefs";
import type { DemoTrack } from "../_lib/types";
import { useDemoT } from "../_lib/useDemoT";

const TRACKS: DemoTrack[] = ["adaptation", "mitigation"];

/**
 * Mitigation / Adaptation tabs — the shape agreed on Sep 4 (both tracks in one
 * module) and the same `Tabs.Root variant="line"` markup the legacy HIAP
 * screen uses, so the two modules read as one product.
 */
export function TrackTabs({
  lng,
  city,
  track,
}: {
  lng: string;
  city: string;
  track: DemoTrack;
}) {
  const { t } = useDemoT(lng);
  const router = useRouter();
  return (
    <Box
      w="full"
      bg="base.light"
      borderBottomWidth="1px"
      borderColor="border.overlay"
    >
      <Box mx="auto" w="full" maxW="1090px" px="l">
        <Tabs.Root
          variant="line"
          value={track}
          onValueChange={(details) => {
            const next = details.value as DemoTrack;
            if (next !== track) router.push(trackHref(lng, city, next));
          }}
        >
          <Tabs.List>
            {TRACKS.map((value) => (
              <Tabs.Trigger
                key={value}
                value={value}
                color="interactive.control"
                display="flex"
                gap="12px"
                py="m"
                _selected={{
                  color: "interactive.secondary",
                  fontFamily: "heading",
                  fontWeight: "bold",
                }}
              >
                <Icon
                  as={
                    value === "mitigation"
                      ? MitigationTabIcon
                      : AdaptationTabIcon
                  }
                />
                <HStack gap="s">
                  <span>{t(`tab-${value}`)}</span>
                  {value === "mitigation" && (
                    <MeedStatusTag tone="warning">
                      {t("mitigation-provisional-tag")}
                    </MeedStatusTag>
                  )}
                </HStack>
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </Tabs.Root>
      </Box>
    </Box>
  );
}
