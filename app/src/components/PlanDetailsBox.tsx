import React from "react";
import { useTranslation } from "@/i18n/client";
import { Box, Link } from "@chakra-ui/react";
import { Trans } from "react-i18next";
import { BodyLarge } from "@/components/Texts/Body";
import { TitleMedium } from "@/components/Texts/Title";
import i18next from "i18next";

interface PlanDetailsBoxProps {
  organization?: {
    name: string;
    projects: Array<{
      cities: any[];
      cityCountLimit: number;
    }>;
  };
}

const PlanDetailsBox: React.FC<PlanDetailsBoxProps> = ({ organization }) => {
  const { t } = useTranslation(i18next.language, "settings");

  if (!organization) return null;
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
            num_cities: organization?.projects.reduce(
              (acc, proj) => acc + proj?.cities.length,
              0,
            ),
            total_cities:
              organization?.projects.reduce(
                (acc, curr) => acc + BigInt(curr.cityCountLimit),
                BigInt(0),
              ) ?? 0,
          }}
          components={{
            bold: <strong />,
          }}
        />
      </BodyLarge>
      <BodyLarge color="content.tertiary">
        {t("contact-us-to-upgrade")}{" "}
        <Link href="mailto:info@openearth.org">
          <BodyLarge color="content.link">info@openearth.org</BodyLarge>
        </Link>
      </BodyLarge>
    </Box>
  );
};

export default PlanDetailsBox;
