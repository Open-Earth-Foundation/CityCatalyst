"use client";
import { Box, Heading, HStack, Icon, Link, Text } from "@chakra-ui/react";
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

/**
 * The compact city band from the module home (`GHGIHomePage/Hero`,
 * `variant="compact"`), rebuilt on the same tokens. The shared Hero needs an
 * inventory record and calls the city-data API on mount; a public, fixture-fed
 * page has neither, and the band is small enough to mirror faithfully.
 */
export function DemoHero({
  lng,
  city,
  track,
  screenId,
  line,
}: {
  lng: string;
  city: CityFixture;
  track: DemoTrack;
  screenId: string;
  /** One-line fact under the name: the risk census or the inventory total. */
  line: string;
}) {
  const { t } = useDemoT(lng);
  return (
    <Box bg="content.alternative" w="full" pt="xxl" pb="xl" px={8}>
      <Box
        display="flex"
        flexDirection="column"
        gap="24px"
        mx="auto"
        maxW="full"
        w="1090px"
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
          <ScreenTag id={screenId} title={t("screen-tag-title")} />
        </HStack>
        <Box display="flex" flexDirection="column" gap={2} pt="m">
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
          <Text fontSize="body.lg" color="background.overlay" fontWeight={400}>
            {line}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
