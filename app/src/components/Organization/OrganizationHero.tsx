import { Tooltip } from "@/components/ui/tooltip";
import type {
  CityLocationResponse,
  OrganizationResponse,
  ProjectWithCities,
} from "@/util/types";
import { Box, Icon, Spinner, Text, Flex } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { MdGridView, MdInfoOutline, MdLocationCity } from "react-icons/md";
import { ModulesIcon } from "../icons";
import { BodyLarge, BodyMedium } from "@/components/package/Texts/Body";
import { DisplayMedium } from "@/components/package/Texts/Display";
import { HeadlineSmall } from "@/components/package/Texts/Headline";
import ProjectMap from "../ProjectMap/ProjectMap";
import { useState } from "react";

interface OrganizationHeroProps {
  organization?: OrganizationResponse;
  isLoading?: boolean;
  t: TFunction;
  projects?: ProjectWithCities[];
  projectId?: string;
}

export const OrganizationHero: React.FC<OrganizationHeroProps> = ({
  t,
  organization,
  projects,
  isLoading = false,
  projectId,
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

  const [selectedCity, setSelectedCity] = useState<
    CityLocationResponse | undefined
  >(undefined);

  return (
    <Box bg="content.alternative" w="full" px="56px" py="56px">
      <Flex mx="auto" maxW="980px" w="full" h="260px">
        <Flex direction="column" gap="24px" w="full">
          <Box display="flex" flexDirection="column" gap={2} mr={8}>
            <Flex align="center" gap={4}>
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
            </Flex>
            <BodyLarge color="background.overlay">
              {t("organization-name")}
            </BodyLarge>
          </Box>
          <Flex gap={8} mt="24px">
            <Flex align="baseline" gap={3}>
              <Icon as={MdGridView} boxSize={6} fill="base.light" />
              <Box>
                <Flex gap={1}>
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
                </Flex>
                <BodyMedium color="background.overlay">
                  {t("active-in-total")}
                </BodyMedium>
              </Box>
            </Flex>
            <Flex align="baseline" gap={3}>
              <Icon as={MdLocationCity} boxSize={6} fill="base.light" />
              <Box>
                <Flex gap={1}>
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
                </Flex>
                <BodyMedium color="background.overlay">
                  {t("across-projects")}
                </BodyMedium>
              </Box>
            </Flex>
          </Flex>
        </Flex>
        <Box mt={-50}>
          <ProjectMap
            organizationId={organization?.organizationId}
            projectId={projectId}
            width={422}
            height={317}
            setSelectedCity={setSelectedCity}
            selectedCity={selectedCity}
          />
        </Box>
      </Flex>
    </Box>
  );
};
