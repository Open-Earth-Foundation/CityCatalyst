// only render map on the client
import dynamic from "next/dynamic";
import type { TFunction } from "i18next";
import type { InventoryResponse } from "@/util/types";
import { Box, Heading, Icon, Spinner, Text } from "@chakra-ui/react";
import { CircleFlag } from "react-circle-flags";
import {
  MdArrowOutward,
  MdGridView,
  MdGroup,
  MdInfoOutline,
  MdLocationCity,
  MdOutlineAspectRatio,
} from "react-icons/md";
import { Tooltip } from "@/components/ui/tooltip";
import { Trans } from "react-i18next/TransWithoutContext";
import Link from "next/link";
import type { OrganizationAttributes } from "@/models/Organization";
import { ModulesIcon } from "../icons";
import { BodyLarge } from "../Texts/Body";

const CityMap = dynamic(() => import("@/components/CityMap"), { ssr: false });

interface OrganizationHeroProps {
  organization?: OrganizationAttributes;
  isLoading?: boolean;
  t: TFunction;
}

export function OrganizationHero({
  organization,
  isLoading,
  t,
}: OrganizationHeroProps) {
  const projectCount = 5;
  const totalCityCount = 32;

  return (
    <Box bg="content.alternative" w="full" px="56px" py="56px">
      <Box className="flex mx-auto max-w-full">
        <Box className="w-full h-[240px] flex flex-col justify-center">
          <Box className="flex h-[240px]">
            <Box className="flex gap-[24px] flex-col h-full w-full">
              <Box className="flex flex-col gap-2">
                <Box className="flex items-center gap-4">
                  {organization ? (
                    <Heading
                      fontSize="display.md"
                      color="base.light"
                      fontWeight="semibold"
                      lineHeight="52"
                      className="flex"
                    >
                      <span data-testid="hero-organization-name">
                        {organization.name}
                      </span>
                    </Heading>
                  ) : (
                    isLoading && <Spinner size="lg" color="white" />
                  )}
                </Box>
                <BodyLarge color="background.overlay">
                  {t("organization-name")}
                </BodyLarge>
              </Box>
              <Box className="flex gap-8 mt-[24px]">
                <Box className="flex align-baseline gap-3">
                  <Icon as={MdGridView} boxSize={6} fill="base.light" />
                  <Box>
                    <Box className="flex gap-1">
                      <Text
                        fontFamily="heading"
                        color="base.light"
                        fontSize="headline.sm"
                        fontWeight="semibold"
                        lineHeight="32"
                      >
                        <>
                          {projectCount}{" "}
                          <span className="text-[16px]">{t("projects")}</span>
                        </>
                      </Text>
                      <Tooltip
                        content={t("active-projects-tooltip")}
                        positioning={{ placement: "bottom-start" }}
                      >
                        <Icon
                          as={MdInfoOutline}
                          w={3}
                          h={3}
                          color="background.overlay"
                        />
                      </Tooltip>
                    </Box>
                    <Text
                      fontSize="body.md"
                      color="background.overlay"
                      fontStyle="normal"
                      fontWeight={400}
                      lineHeight="20px"
                      letterSpacing="wide"
                    >
                      {t("active-in-total")}
                    </Text>
                  </Box>
                </Box>
                <Box className="flex align-baseline gap-3">
                  <Icon as={MdLocationCity} boxSize={6} fill="base.light" />
                  <Box>
                    <Box className="flex gap-1">
                      <Text
                        fontFamily="heading"
                        color="base.light"
                        fontSize="headline.sm"
                        fontWeight="semibold"
                        lineHeight="32"
                      >
                        {totalCityCount} {t("cities")}
                      </Text>
                      <Tooltip
                        content={t("city-count-tooltip")}
                        positioning={{
                          placement: "bottom-start",
                        }}
                      >
                        <Icon
                          as={MdInfoOutline}
                          w={3}
                          h={3}
                          color="background.overlay"
                        />
                      </Tooltip>
                    </Box>
                    <Text
                      fontSize="body.md"
                      color="background.overlay"
                      fontStyle="normal"
                      fontWeight={400}
                      lineHeight="20px"
                      letterSpacing="wide"
                    >
                      {t("across-projects")}
                    </Text>
                  </Box>
                </Box>
                <Box className="flex align-baseline gap-3">
                  <Icon as={ModulesIcon} boxSize={6} fill="base.light" />
                  <Box>
                    <Box className="flex gap-1">
                      <Text
                        fontFamily="heading"
                        color="base.light"
                        fontSize="headline.sm"
                        fontWeight="semibold"
                        lineHeight="32"
                      >
                        {t("pro")}
                      </Text>
                      <Tooltip
                        content={t("active-plan-tooltip")}
                        positioning={{
                          placement: "bottom-start",
                        }}
                      >
                        <Icon
                          as={MdInfoOutline}
                          w={3}
                          h={3}
                          color="background.overlay"
                        />
                      </Tooltip>
                    </Box>
                    <Text
                      fontSize="body.md"
                      color="background.overlay"
                      fontStyle="normal"
                      fontWeight={400}
                      lineHeight="20px"
                      letterSpacing="wide"
                    >
                      {t("active-plan")}
                    </Text>
                  </Box>
                </Box>
              </Box>
            </Box>
            <Box mt={-50}>
              {/* TODO create organization map or re-use project map? */}
              <CityMap locode="BR SAO" width={422} height={317} />
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
