import { Tooltip } from "@/components/ui/tooltip";
import type { OrganizationResponse, ProjectWithCities } from "@/util/types";
import { Box, Icon, Spinner, Text } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import dynamic from "next/dynamic";
import { MdGridView, MdInfoOutline, MdLocationCity } from "react-icons/md";
import { ModulesIcon } from "../icons";
import { BodyLarge } from "../Texts/Body";
import { DisplayMedium } from "../Texts/Display";

// only render map on the client
const CityMap = dynamic(() => import("@/components/CityMap"), { ssr: false });

interface OrganizationHeroProps {
  organization?: OrganizationResponse;
  isLoading?: boolean;
  t: TFunction;
  projects?: ProjectWithCities[];
}

export const OrganizationHero: React.FC<OrganizationHeroProps> = ({
  t,
  organization,
  projects,
  isLoading = false,
}) => {
  // Calculate stats
  const totalProjects = projects?.length ?? 0;
  const totalCities = new Set(
    projects?.flatMap((project) => project.cities.map((city) => city.cityId)),
  ).size;
  const displayName =
    organization?.name === "cc_organization_default"
      ? t("default-organization")
      : organization?.name;

  return (
    <Box bg="content.alternative" w="full" px="56px" py="56px">
      <Box className="flex mx-auto max-w-full w-[980px] h-[260px]">
        <Box className="flex gap-[24px] flex-col w-full">
          <Box className="flex flex-col gap-2 mr-8">
            <Box className="flex items-center gap-4">
              {organization ? (
                <DisplayMedium
                  data-testid="hero-organization-name"
                  color="base.light"
                  maxW="550px"
                  truncate
                >
                  {displayName}
                </DisplayMedium>
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
                    {totalProjects} {t("projects")}
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
                    {totalCities} {t("cities")}
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
  );
};
