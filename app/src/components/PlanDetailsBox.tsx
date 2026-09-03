import React from "react";
import { useTranslation } from "@/i18n/client";
import { Box, Text, Link, HStack, Icon } from "@chakra-ui/react";
import { BodyLarge } from "@/components/package/Texts/Body";
import { TitleLarge } from "@/components/package/Texts/Title";
import i18next from "i18next";
import { OrganizationResponse } from "@/util/types";
import { env } from "@/lib/runtime-env";
import { CitiesBuildingIcon, CityLimitIcon, PlanFolderIcon } from "./icons";
import { PlanBadge } from "@/components/PlanBadge";
import { getOrganizationPlanDisplay } from "@/util/plan-details";
import { OrganizationPlanType } from "@/util/enums";

interface PlanDetailsBoxProps {
  organization?: OrganizationResponse;
}

const PlanDetailsBox: React.FC<PlanDetailsBoxProps> = ({ organization }) => {
  const { t } = useTranslation(i18next.language, "settings");

  if (!organization) return null;

  const supportEmails = (env("NEXT_PUBLIC_SUPPORT_EMAILS") ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter((email) => email && email !== "greta@openearth.org")
    .join(",");

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
      align="center"
      backgroundColor="white"
      p={6}
      gap="24px"
      borderRadius="8px"
      boxShadow="shadow-lg"
    >
      <PlanBadge
        planType={planType}
        trialDaysRemaining={trialDaysRemaining}
        t={t}
      />
      <Box flex={1}>
        <TitleLarge color="content.secondary" mb="16px">
          {organization.name}
        </TitleLarge>
        <HStack gap="24px" flexWrap="wrap">
          <HStack>
            <Icon as={PlanFolderIcon} boxSize="24px" />
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
          <Link href={`mailto:${supportEmails}`}>
            <Text as="span" color="content.link">
              {supportEmails}
            </Text>
          </Link>
        </BodyLarge>
      </Box>
    </HStack>
  );
};

export default PlanDetailsBox;

