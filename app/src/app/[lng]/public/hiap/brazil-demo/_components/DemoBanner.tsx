"use client";
import { Box, HStack, Icon, Link } from "@chakra-ui/react";
import NextLink from "next/link";
import { LuFlaskConical } from "react-icons/lu";
import { BodySmall } from "@/components/package/Texts/Body";
import { LabelMedium } from "@/components/package/Texts/Label";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import { useDemoT } from "../_lib/useDemoT";
import { demoHome } from "../_lib/hrefs";
import { FEEDBACK_SHEET_URL } from "../_lib/links";

/**
 * Persistent strip under the navigation bar. Everything in the demo is
 * illustrative, and a reviewer who lands mid-flow from a shared link has to be
 * told so on every screen, not only on the guide.
 */
export function DemoBanner({ lng }: { lng: string }) {
  const { t } = useDemoT(lng);
  return (
    <Box
      w="full"
      bg="sentiment.warningOverlay"
      borderBottomWidth="1px"
      borderColor="sentiment.warningDefault"
      role="note"
    >
      <HStack
        mx="auto"
        w="full"
        maxW="1090px"
        px="l"
        py="s"
        gap="m"
        alignItems="center"
        flexWrap="wrap"
      >
        <HStack gap="s" alignItems="center" flex="1" minW="240px">
          <Icon
            as={LuFlaskConical}
            boxSize="16px"
            color="sentiment.warningDefault"
          />
          <LabelMedium color="sentiment.warningDefault">
            {t("banner-title")}
          </LabelMedium>
          <BodySmall color="content.secondary">{t("banner-body")}</BodySmall>
        </HStack>
        <HStack gap="m" flexWrap="wrap">
          <Link
            asChild
            color="content.link"
            fontFamily="heading"
            fontSize="label.md"
            fontWeight="semibold"
            textDecoration="underline"
            _focusVisible={FOCUS_RING}
          >
            <NextLink href={demoHome(lng)}>{t("banner-guide-link")}</NextLink>
          </Link>
          {FEEDBACK_SHEET_URL && (
            <Link
              href={FEEDBACK_SHEET_URL}
              target="_blank"
              rel="noreferrer"
              color="content.link"
              fontFamily="heading"
              fontSize="label.md"
              fontWeight="semibold"
              textDecoration="underline"
              _focusVisible={FOCUS_RING}
            >
              {t("banner-sheet-link")}
            </Link>
          )}
        </HStack>
      </HStack>
    </Box>
  );
}
