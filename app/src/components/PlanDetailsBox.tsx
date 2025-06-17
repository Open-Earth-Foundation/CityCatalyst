import React from "react";
import { useTranslation } from "@/i18n/client";
import { Box, Link } from "@chakra-ui/react";
import { Trans } from "react-i18next";
import { BodyLarge } from "@/components/Texts/Body";
import { TitleMedium } from "@/components/Texts/Title";
import i18next from "i18next";
import { OrganizationResponse } from "@/util/types";

interface PlanDetailsBoxProps {
  organization?: OrganizationResponse;
}

interface ProjectStats {
  numCities: number;
  totalCityLimit: bigint;
}

const calculateProjectStats = (
  projects: OrganizationResponse["projects"],
): ProjectStats => {
  return projects.reduce(
    (acc, project) => ({
      numCities: acc.numCities + project.cities.length,
      totalCityLimit: acc.totalCityLimit + BigInt(project.cityCountLimit),
    }),
    { numCities: 0, totalCityLimit: 0n },
  );
};

const PlanDetailsBox: React.FC<PlanDetailsBoxProps> = ({ organization }) => {
  const { t } = useTranslation(i18next.language, "settings");

  if (!organization) return null;

  const { numCities, totalCityLimit } = organization.projects
    ? calculateProjectStats(organization.projects)
    : { numCities: 0, totalCityLimit: 0n };

  return (
    <Box backgroundColor="white" p={6} marginTop={4}>
      <TitleMedium color="content.secondary">{t("plan-details")}</TitleMedium>
      <BodyLarge color="content.tertiary">
        <Trans
          i18nKey="plan-details-caption"
          t={t}
          values={{
            name: organization?.name,
            num_projects: organization?.projects.length ?? 0,
            num_cities: numCities,
            total_cities: totalCityLimit,
          }}
          components={{
            bold: <strong />,
          }}
        />
      </BodyLarge>
      <BodyLarge color="content.tertiary">
        {t("contact-us-to-upgrade")}{" "}
        <Link href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAILS}`}>
          <BodyLarge color="content.link">
            {process.env.NEXT_PUBLIC_SUPPORT_EMAILS}
          </BodyLarge>
        </Link>
      </BodyLarge>
    </Box>
  );
};

export default PlanDetailsBox;
