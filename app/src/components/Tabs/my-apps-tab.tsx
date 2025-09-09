"use client";

import {
  Box,
  Tabs,
  Text,
} from "@chakra-ui/react";
import React, { FC } from "react";
import { api } from "@/services/api";
import ProgressLoader from "@/components/ProgressLoader";
import { AppCard } from "../Cards/AppCard";
import { useTranslation } from "@/i18n/client";

interface MyAppsTabProps {
  lng: string;
}

const MyAppsTab: FC<MyAppsTabProps> = ({
  lng,
}) => {
  const { t } = useTranslation(lng, "settings");


  const { data: apps, isLoading: isAppsLoading } = api.useGetAuthzsQuery()

  return (
    <>
      <Tabs.Content value="my-apps">
        <Box display="flex" flexDirection="column" gap="48px" marginTop="32px">
          <Box>
            <Text
              color="content.primary"
              fontWeight="bold"
              lineHeight="32"
              fontSize="headline.sm"
              fontFamily="heading"
              fontStyle="normal"
            >
              {t("my-apps")}
            </Text>
            <Text
              color="content.tertiary"
              fontWeight="normal"
              lineHeight="24"
              fontSize="body.lg"
              letterSpacing="wide"
              marginTop="8px"
            >
              {t("my-apps-sub-title")}
            </Text>
          </Box>

          { (isAppsLoading)
            ? <ProgressLoader />
            : (!apps || apps.length === 0)
              ? <Box>{t("no-apps")}</Box>
              : apps.map((app) => (
                <AppCard key={app.clientId} lng={lng} app={app} />
              ))
          }
        </Box>
      </Tabs.Content>
    </>
  );
};

export default MyAppsTab;
