import React from "react";
import { useTranslation } from "@/i18n/client";
import { Box, Text, Link, HStack, Icon } from "@chakra-ui/react";
import { BodyLarge } from "@/components/package/Texts/Body";
import { TitleMedium } from "@/components/package/Texts/Title";
import i18next from "i18next";
import { OrganizationResponse } from "@/util/types";
import { env } from "@/lib/runtime-env";
import { BiFolder } from "react-icons/bi";
import { CitiesBuildingIcon, CityLimitIcon } from "./icons";
import { PlanBadge } from "@/components/PlanBadge";
import { getOrganizationPlanDisplay } from "@/util/plan-details";
import { OrganizationPlanType } from "@/util/enums";

interface PlanDetailsBoxProps {
  organization?: OrganizationResponse;
}

const PlanDetailsBox: React.FC<PlanDetailsBoxProps> = ({ organization }) => {
  const { t } = useTranslation(i18next.language, "settings");

  if (!organization) return null;

  const {
    planType,
    projectCount,
    numCities,
    citySlotsRemaining,
    trialDaysRemaining,
  } = getOrganizationPlanDisplay({
    ...organization,
    planType: organization.planType ?? OrganizationPlanType.FULL,
  });

  return (
    <HStack
      align="flex-start"
      backgroundColor="white"
      p={6}
      marginTop={4}
      gap="24px"
    >
      <PlanBadge
        planType={planType}
        trialDaysRemaining={trialDaysRemaining}
        t={t}
      />
      <Box flex={1}>
        <TitleMedium color="content.secondary" mb="16px">
          {organization.name}
        </TitleMedium>
        <HStack gap="24px" flexWrap="wrap">
          <HStack>
            <Icon as={BiFolder} />
            <BodyLarge color="content.secondary">
              {projectCount} {t("projects")}
            </BodyLarge>
          </HStack>
          <HStack>
            <Icon as={CitiesBuildingIcon} />
            <BodyLarge color="content.secondary">
              {numCities} {t("cities-in-use")}
            </BodyLarge>
          </HStack>
          <HStack>
            <Icon as={CityLimitIcon} />
            <BodyLarge color="content.secondary">
              {citySlotsRemaining} {t("city-slots-remaining")}
            </BodyLarge>
          </HStack>
        </HStack>
        <BodyLarge color="content.tertiary" mt="24px">
          {t("contact-us-to-upgrade")}{" "}
          <Link href={`mailto:${env("NEXT_PUBLIC_SUPPORT_EMAILS")}`}>
            <Text as="span" color="content.link">
              {env("NEXT_PUBLIC_SUPPORT_EMAILS")}
            </Text>
          </Link>
        </BodyLarge>
      </Box>
    </HStack>
  );
};

export default PlanDetailsBox;
