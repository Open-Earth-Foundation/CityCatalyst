"use client";
import {
  Box,
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
}: {
  lng: string;
  city: CityFixture;
  track: DemoTrack;
  screenId: string;
  /** One-line fact under the name: the risk census or the inventory total. */
  line: string;
  /** What this track does, in one sentence. */
  description?: string;
  /** The ranking's state, shown next to the action. */
  status?: string;
  /** The primary call to action for this track. */
  action?: React.ReactNode;
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
