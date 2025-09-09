"use client";

import { Box, Tabs, Text } from "@chakra-ui/react";
import React, { FC } from "react";
import { api } from "@/services/api";
import ProgressLoader from "@/components/ProgressLoader";
import { AppCard } from "../Cards/AppCard";
import { useTranslation } from "@/i18n/client";
import { HeadlineSmall } from "../Texts/Headline";
import { BodyLarge } from "../Texts/Body";

interface MyAppsTabProps {
  lng: string /** Language to use for UI and client descriptions */;
}

const MyAppsTab: FC<MyAppsTabProps> = ({ lng }) => {
  const { t } = useTranslation(lng, "settings");

  const {
    data: apps,
    isLoading: isAppsLoading,
    error,
  } = api.useGetAuthzsQuery();

  return (
    <>
      <Tabs.Content value="my-apps">
        <Box display="flex" flexDirection="column" gap="48px" marginTop="32px">
          <Box>
            <HeadlineSmall text={t("my-apps")} />
            <BodyLarge text={t("my-apps-sub-title")} />
          </Box>
          {isAppsLoading ? (
            <ProgressLoader />
          ) : error ? (
            <Box>{t("my-apps-error-loading-apps")}</Box>
          ) : !apps || apps.length === 0 ? (
            <Box>{t("no-apps")}</Box>
          ) : (
            apps.map((app) => (
              <AppCard key={app.clientId} lng={lng} app={app} />
            ))
          )}
        </Box>
      </Tabs.Content>
    </>
  );
};

export default MyAppsTab;
