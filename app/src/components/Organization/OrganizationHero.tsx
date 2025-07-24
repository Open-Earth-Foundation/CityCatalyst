import { Tooltip } from "@/components/ui/tooltip";
import type { OrganizationResponse, ProjectWithCities } from "@/util/types";
import { Box, Icon, Spinner, Text } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import dynamic from "next/dynamic";
import { MdGridView, MdInfoOutline, MdLocationCity } from "react-icons/md";
import { ModulesIcon } from "../icons";
import { BodyLarge, BodyMedium } from "../Texts/Body";
import { DisplayMedium } from "../Texts/Display";
import { HeadlineSmall } from "../Texts/Headline";

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
              {isLoading ? (
                <Spinner size="lg" color="white" />
              ) : organization ? (
                <DisplayMedium
                  data-testid="hero-organization-name"
                  color="base.light"
                  maxW="550px"
                  truncate
                >
                  {displayName}
                </DisplayMedium>
              ) : (
                <HeadlineSmall color="base.light">
                  {t("organization-load-failed")}
                </HeadlineSmall>
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
                <BodyMedium color="background.overlay">
                  {t("active-in-total")}
                </BodyMedium>
              </Box>
            </Box>
            <Box className="flex align-baseline gap-3">
              <Icon as={MdLocationCity} boxSize={6} fill="base.light" />
              <Box>
                <Box className="flex gap-1">
                  <HeadlineSmall color="base.light">
                    {totalCities} {t("cities")}
                  </HeadlineSmall>
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
                <BodyMedium color="background.overlay">
                  {t("across-projects")}
                </BodyMedium>
              </Box>
            </Box>
            <Box className="flex align-baseline gap-3">
              <Icon as={ModulesIcon} boxSize={6} fill="base.light" />
              <Box>
                <Box className="flex gap-1">
                  <HeadlineSmall color="base.light">{t("pro")}</HeadlineSmall>
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
                <BodyMedium color="background.overlay">
                  {t("active-plan")}
                </BodyMedium>
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
