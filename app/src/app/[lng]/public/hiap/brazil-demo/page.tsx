"use client";
import React from "react";
import {
  Box,
  Card,
  HStack,
  Icon,
  Link,
  SimpleGrid,
  Table,
  VStack,
} from "@chakra-ui/react";
import NextLink from "next/link";
import { LuArrowRight, LuExternalLink } from "react-icons/lu";
import { HeadlineLarge } from "@/components/package/Texts/Headline";
import {
  BodyLarge,
  BodyMedium,
  BodySmall,
} from "@/components/package/Texts/Body";
import { LabelLarge, LabelMedium } from "@/components/package/Texts/Label";
import { Overline } from "@/components/package/Texts/Overline";
import { TitleMedium } from "@/components/package/Texts/Title";
import { MeedButton } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedButton";
import { MeedStatusTag } from "@/app/[lng]/cities/[cityId]/MEED/components/MeedStatusTag";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";
import { CITIES, DEFAULT_CITY } from "./_lib/cities";
import { SCREEN_IDS, trackHref } from "./_lib/hrefs";
import { FEEDBACK_SHEET_URL, METHODOLOGY_DOC_URL } from "./_lib/links";
import { useDemoT } from "./_lib/useDemoT";
import { ScreenTag } from "./_components/ScreenTag";

const SCREENS: {
  id: string;
  key: string;
  track: "adaptation" | "mitigation";
  segment?: string;
}[] = [
  { id: SCREEN_IDS.adaptation.home, key: "a-home", track: "adaptation" },
  {
    id: SCREEN_IDS.adaptation.risk,
    key: "a-risk",
    track: "adaptation",
    segment: "risk",
  },
  {
    id: SCREEN_IDS.adaptation.preferences,
    key: "a-preferences",
    track: "adaptation",
    segment: "preferences",
  },
  {
    id: SCREEN_IDS.adaptation.preflight,
    key: "a-preflight",
    track: "adaptation",
    segment: "preflight",
  },
  {
    id: SCREEN_IDS.adaptation.drawer,
    key: "a-drawer",
    track: "adaptation",
  },
  {
    id: SCREEN_IDS.adaptation.legal,
    key: "a-legal",
    track: "adaptation",
    segment: "legal",
  },
  {
    id: SCREEN_IDS.adaptation.finance,
    key: "a-finance",
    track: "adaptation",
    segment: "finance",
  },
  {
    id: SCREEN_IDS.adaptation.policy,
    key: "a-policy",
    track: "adaptation",
    segment: "policy",
  },
  {
    id: SCREEN_IDS.adaptation.context,
    key: "a-context",
    track: "adaptation",
    segment: "context",
  },
  { id: SCREEN_IDS.mitigation.home, key: "m-home", track: "mitigation" },
];

/** BR-00 — the review guide. */
export default function DemoGuidePage(props: {
  params: Promise<{ lng: string }>;
}) {
  const { lng } = React.use(props.params);
  const { t } = useDemoT(lng);
  return (
    <Box
      mx="auto"
      w="full"
      maxW="1090px"
      px="l"
      pt="xxl"
      pb="xxl-6"
      display="flex"
      flexDirection="column"
      gap="xl"
    >
      <HStack
        justifyContent="space-between"
        alignItems="flex-start"
        gap="m"
        flexWrap="wrap"
      >
        <VStack alignItems="stretch" gap="s" maxW="720px">
          <Overline color="content.tertiary">{t("guide-eyebrow")}</Overline>
          <HeadlineLarge color="content.primary">
            {t("guide-title")}
          </HeadlineLarge>
          <BodyLarge color="content.secondary">{t("guide-intro")}</BodyLarge>
        </VStack>
        <ScreenTag id={SCREEN_IDS.guide} title={t("screen-tag-title")} />
      </HStack>

      <SimpleGrid columns={{ base: 1, md: 3 }} gap="m">
        {(["what", "comment", "data"] as const).map((k) => (
          <Card.Root key={k} borderColor="border.overlay" h="full">
            <Card.Body>
              <VStack alignItems="stretch" gap="s">
                <LabelLarge color="content.primary">
                  {t(`guide-${k}-title`)}
                </LabelLarge>
                <BodyMedium color="content.secondary">
                  {t(`guide-${k}-body`)}
                </BodyMedium>
                {k === "comment" && FEEDBACK_SHEET_URL && (
                  <Link
                    href={FEEDBACK_SHEET_URL}
                    target="_blank"
                    rel="noreferrer"
                    color="content.link"
                    fontFamily="heading"
                    fontSize="label.md"
                    fontWeight="semibold"
                    _focusVisible={FOCUS_RING}
                  >
                    <HStack gap="xs">
                      <span>{t("guide-sheet-link")}</span>
                      <Icon as={LuExternalLink} boxSize="14px" />
                    </HStack>
                  </Link>
                )}
                {k === "data" && (
                  <Link
                    href={METHODOLOGY_DOC_URL}
                    target="_blank"
                    rel="noreferrer"
                    color="content.link"
                    fontFamily="heading"
                    fontSize="label.md"
                    fontWeight="semibold"
                    _focusVisible={FOCUS_RING}
                  >
                    <HStack gap="xs">
                      <span>{t("guide-methodology-link")}</span>
                      <Icon as={LuExternalLink} boxSize="14px" />
                    </HStack>
                  </Link>
                )}
              </VStack>
            </Card.Body>
          </Card.Root>
        ))}
      </SimpleGrid>

      <VStack alignItems="stretch" gap="m">
        <VStack alignItems="stretch" gap="xs">
          <TitleMedium color="content.primary">
            {t("guide-cities-title")}
          </TitleMedium>
          <BodySmall color="content.secondary">
            {t("guide-cities-body")}
          </BodySmall>
        </VStack>
        <SimpleGrid columns={{ base: 1, sm: 2, md: 5 }} gap="m">
          {CITIES.map((city) => (
            <Card.Root
              key={city.slug}
              asChild
              borderColor="border.neutral"
              _hover={{ borderColor: "content.link", boxShadow: "2dp" }}
              _focusVisible={FOCUS_RING}
            >
              <NextLink href={trackHref(lng, city.slug, "adaptation")}>
                <Card.Body>
                  <VStack alignItems="flex-start" gap="xs">
                    <LabelLarge color="content.primary">{city.name}</LabelLarge>
                    <BodySmall color="content.tertiary">
                      {city.state} · {t(`guide-city-${city.slug}`)}
                    </BodySmall>
                    {city.coastal && (
                      <MeedStatusTag tone="warning">
                        {t("guide-coastal")}
                      </MeedStatusTag>
                    )}
                  </VStack>
                </Card.Body>
              </NextLink>
            </Card.Root>
          ))}
        </SimpleGrid>
        <HStack>
          <MeedButton
            asChild
            minW="auto"
            px="l"
            rightIcon={<Icon as={LuArrowRight} boxSize="16px" />}
          >
            <NextLink href={trackHref(lng, DEFAULT_CITY.slug, "adaptation")}>
              {t("guide-start")}
            </NextLink>
          </MeedButton>
        </HStack>
      </VStack>

      <VStack alignItems="stretch" gap="m">
        <VStack alignItems="stretch" gap="xs">
          <TitleMedium color="content.primary">
            {t("guide-screens-title")}
          </TitleMedium>
          <BodySmall color="content.secondary">
            {t("guide-screens-body")}
          </BodySmall>
        </VStack>
        <Card.Root overflow="hidden" borderColor="border.neutral">
          <Table.Root size="md">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader w="90px">
                  {t("guide-col-id")}
                </Table.ColumnHeader>
                <Table.ColumnHeader>{t("guide-col-screen")}</Table.ColumnHeader>
                <Table.ColumnHeader
                  display={{ base: "none", md: "table-cell" }}
                >
                  {t("guide-col-look")}
                </Table.ColumnHeader>
                <Table.ColumnHeader w="120px" />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {SCREENS.map((s) => (
                <Table.Row key={s.id}>
                  <Table.Cell>
                    <LabelMedium color="content.link" fontFamily="mono">
                      {s.id}
                    </LabelMedium>
                  </Table.Cell>
                  <Table.Cell>
                    <BodyMedium color="content.primary" fontWeight="semibold">
                      {t(`screen-${s.key}`)}
                    </BodyMedium>
                  </Table.Cell>
                  <Table.Cell display={{ base: "none", md: "table-cell" }}>
                    <BodySmall color="content.secondary">
                      {t(`screen-${s.key}-look`)}
                    </BodySmall>
                  </Table.Cell>
                  <Table.Cell>
                    <Link
                      asChild
                      color="content.link"
                      fontFamily="heading"
                      fontSize="label.md"
                      fontWeight="semibold"
                      _focusVisible={FOCUS_RING}
                    >
                      <NextLink
                        href={trackHref(
                          lng,
                          DEFAULT_CITY.slug,
                          s.track,
                          s.segment,
                        )}
                      >
                        {t("guide-open")}
                      </NextLink>
                    </Link>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Card.Root>
      </VStack>
    </Box>
  );
}
