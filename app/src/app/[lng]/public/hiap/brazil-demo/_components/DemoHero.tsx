"use client";
import React from "react";
import {
  Box,
  chakra,
  Heading,
  HStack,
  Icon,
  Link,
  Text,
  VStack,
} from "@chakra-ui/react";
import { CircleFlag } from "react-circle-flags";
import { MdChevronRight } from "react-icons/md";
import {
  BreadcrumbCurrentLink,
  BreadcrumbLink,
  BreadcrumbRoot,
} from "@/components/ui/breadcrumb";
import type { CityFixture, DemoTrack } from "../_lib/types";
import { demoHome } from "../_lib/hrefs";
import { useDemoT } from "../_lib/useDemoT";
import { ScreenTag } from "./ScreenTag";
import { CitySwitcher } from "./CitySwitcher";
import { FOCUS_RING } from "@/app/[lng]/cities/[cityId]/MEED/focusRing";

/**
 * The inline link on the blue band: white, underlined like the breadcrumb.
 * Same role as `TextLink` below the band, where the link colour reads.
 */
export function HeroLink({
  children,
  href,
  onClick,
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
}) {
  const style = {
    color: "base.light",
    fontFamily: "heading",
    fontSize: "body.md",
    fontWeight: "semibold",
    textDecoration: "underline",
    textUnderlineOffset: "4px",
    _hover: { opacity: 0.8 },
    _focusVisible: FOCUS_RING,
  } as const;
  if (href) {
    return (
      <Link href={href} {...style}>
        {children}
      </Link>
    );
  }
  return (
    <chakra.button type="button" onClick={onClick} {...style}>
      {children}
    </chakra.button>
  );
}

/**
 * The city band at the top of the module home, after `GHGIHomePage/Hero`
 * (`variant="compact"`) on the same tokens, and carrying everything the
 * reader needs before the tabs: who this is for (programme, city, one fact),
 * what the module does (one sentence) and the one thing to do next (the
 * call to action, with the ranking's status beside it). The content column
 * below then starts straight on the results or the inputs — no second
 * heading to read past.
 */
export function DemoHero({
  lng,
  city,
  track,
  screenId,
  line,
  description,
  status,
  action,
  headline,
  cityAside,
}: {
  lng: string;
  city: CityFixture;
  track: DemoTrack;
  screenId: string;
  /** One-line fact under the name: the risk census or the inventory total. */
  line: React.ReactNode;
  /** What this track does, in one sentence. */
  description?: string;
  /** The ranking's state, shown next to the action. */
  status?: string;
  /** The primary call to action for this track. */
  action?: React.ReactNode;
  /**
   * The compact band of the proposal home: when set, the headline is the
   * page title, the city sits on one line under it (with `cityAside` beside
   * the name), and `line` becomes the status line. No call to action.
   */
  headline?: string;
  cityAside?: React.ReactNode;
}) {
  const { t } = useDemoT(lng);
  if (headline) {
    return (
      <Box
        bg="content.alternative"
        w="full"
        pt={{ base: "l", md: "xl" }}
        pb={{ base: "l", md: "xl" }}
        data-testid="demo-hero"
      >
        <Box
          display="flex"
          flexDirection="column"
          gap="m"
          mx="auto"
          w="full"
          maxW="1090px"
          px="l"
        >
          <HStack
            justifyContent="space-between"
            alignItems="center"
            gap="m"
            flexWrap="wrap"
          >
            <BreadcrumbRoot
              separator={
                <Icon as={MdChevronRight} boxSize={4} color="base.light" />
              }
              separatorGap="8px"
              fontFamily="body"
            >
              <BreadcrumbLink href={demoHome(lng)} asChild>
                <Link href={demoHome(lng)} color="base.light">
                  <Text
                    fontSize="body.md"
                    color="base.light"
                    lineHeight="20px"
                    textDecoration="underline"
                    textUnderlineOffset="6px"
                    _hover={{ opacity: 0.7 }}
                  >
                    {t("breadcrumb-demo")}
                  </Text>
                </Link>
              </BreadcrumbLink>
              <BreadcrumbCurrentLink>
                <Text fontSize="body.md" color="border.neutral">
                  {t("breadcrumb-module")} · {t(`tab-${track}`)}
                </Text>
              </BreadcrumbCurrentLink>
            </BreadcrumbRoot>
            <HStack gap="s" flexShrink={0}>
              <ScreenTag id={screenId} title={t("screen-tag-title")} />
              <CitySwitcher lng={lng} city={city.slug} track={track} />
            </HStack>
          </HStack>

          <VStack alignItems="flex-start" gap="xs" pt="xs">
            <Text
              fontSize="body.md"
              fontWeight="semibold"
              color="background.overlay"
            >
              {t("hero-programme")}
            </Text>
            <Heading
              as="h1"
              fontSize={{ base: "headline.sm", md: "headline.lg" }}
              lineHeight={{ base: "32px", md: "40px" }}
              color="base.light"
              fontWeight="semibold"
            >
              {headline}
            </Heading>
          </VStack>
          <HStack
            gap={{ base: "s", md: "l" }}
            rowGap="s"
            flexWrap="wrap"
            alignItems="center"
          >
            <HStack gap="s" alignItems="center">
              <CircleFlag countryCode="br" width={22} />
              <Text
                fontSize="title.lg"
                lineHeight="28px"
                fontWeight="semibold"
                color="base.light"
              >
                {city.name}, {city.state}
              </Text>
            </HStack>
            {cityAside}
            <Box
              display={{ base: "none", md: "block" }}
              w="1px"
              h="20px"
              bg="background.overlay"
              opacity={0.4}
              aria-hidden
            />
            <Box w={{ base: "full", md: "auto" }}>{line}</Box>
          </HStack>
        </Box>
      </Box>
    );
  }
  return (
    <Box bg="content.alternative" w="full" pt="64px" pb="64px">
      {/* Same column as the tabs and the content below: 1090px, padded. */}
      <Box
        display="flex"
        flexDirection="column"
        gap="24px"
        mx="auto"
        w="full"
        maxW="1090px"
        px="l"
      >
        <HStack
          justifyContent="space-between"
          alignItems="flex-start"
          gap="m"
          flexWrap="wrap"
        >
          <BreadcrumbRoot
            separator={
              <Icon as={MdChevronRight} boxSize={4} color="base.light" />
            }
            separatorGap="8px"
            fontFamily="body"
          >
            <BreadcrumbLink href={demoHome(lng)} asChild>
              <Link href={demoHome(lng)} color="base.light">
                <Text
                  fontSize="body.md"
                  color="base.light"
                  lineHeight="20px"
                  textDecoration="underline"
                  textUnderlineOffset="8px"
                  _hover={{ opacity: 0.7 }}
                >
                  {t("breadcrumb-demo")}
                </Text>
              </Link>
            </BreadcrumbLink>
            <BreadcrumbCurrentLink>
              <Text fontSize="body.md" color="border.neutral">
                {t("breadcrumb-module")} · {t(`tab-${track}`)}
              </Text>
            </BreadcrumbCurrentLink>
          </BreadcrumbRoot>
          <HStack gap="s" flexShrink={0}>
            <ScreenTag id={screenId} title={t("screen-tag-title")} />
            <CitySwitcher lng={lng} city={city.slug} track={track} />
          </HStack>
        </HStack>

        <HStack
          justifyContent="space-between"
          alignItems="flex-end"
          gap="l"
          flexWrap="wrap"
          pt="m"
        >
          <Box
            display="flex"
            flexDirection="column"
            gap={2}
            flex="1"
            minW="280px"
          >
            <Text
              fontSize="title.md"
              w="max-content"
              fontWeight="semibold"
              color="white"
            >
              {t("hero-programme")}
            </Text>
            <Box display="flex" alignItems="center" gap={4}>
              <CircleFlag countryCode="br" width={32} />
              <Heading
                as="h1"
                fontSize="display.md"
                color="base.light"
                fontWeight="semibold"
                lineHeight="52"
                display="flex"
              >
                <span>
                  {city.name}, {city.state}
                </span>
              </Heading>
            </Box>
            <Text
              fontSize="body.lg"
              color="background.overlay"
              fontWeight={400}
            >
              {line}
            </Text>
            {description && (
              <Text
                fontSize="body.md"
                lineHeight="20px"
                color="base.light"
                maxW="640px"
                mt="s"
              >
                {description}
              </Text>
            )}
          </Box>
          {(action || status) && (
            <VStack alignItems={{ base: "stretch", md: "flex-end" }} gap="s">
              {action}
              {status && (
                <Text
                  fontSize="body.sm"
                  color="background.overlay"
                  textAlign="end"
                >
                  {status}
                </Text>
              )}
            </VStack>
          )}
        </HStack>
      </Box>
    </Box>
  );
}
