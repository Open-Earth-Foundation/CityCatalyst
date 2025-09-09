"use client";

import React, { use } from "react";
import { useParams, useSearchParams } from "next/navigation";

import { useTranslation } from "@/i18n/client";
import { Box, Tabs, Text } from "@chakra-ui/react";
import { MyProfileTab } from "@/components/Tabs/MyProfileTab";
import MyFilesTab from "@/components/Tabs/my-files-tab";
import MyInventoriesTab from "@/components/Tabs/my-inventories-tab";
import MyAppsTab from "@/components/Tabs/my-apps-tab";
import { api } from "@/services/api";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";
import { getParamValueRequired } from "@/util/helpers";

export type ProfileInputs = {
  name: string;
  email: string;
  city: string;
  role: string;
  locode: string;
  userId: string;
  title?: string | null;
  preferredLanguage?: string;
};

export type UserDetails = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type CityData = {
  id: string;
  name: string;
  state: string;
  country: string;
  lastUpdated: string;
};

const tabValues = ["my-profile", "my-files", "my-inventories"];

if (hasFeatureFlag(FeatureFlags.OAUTH_ENABLED)) {
  tabValues.push("my-apps");
}

export default function Settings() {
  const params = useParams();
  const lng = getParamValueRequired(params.lng);

  const searchParams = useSearchParams();
  const paramValue = searchParams.get("tabIndex");
  const tabIndex = paramValue ? Number(paramValue) : 0;
  const defaultTab = tabValues[tabIndex] ?? tabValues[0];

  const { t } = useTranslation(lng, "settings");

  const { data: userInfo, isLoading: isUserInfoLoading } =
    api.useGetUserInfoQuery();

  const { data: cities, isLoading: isCitiesLoading } = api.useGetCitiesQuery({
    skip: !userInfo,
  });

  const { inventory: inventoryParam } = useParams();
  const inventoryId = inventoryParam as string;

  // TODO cache current city ID or select it differently / create custom route
  const { data: inventory } = api.useGetInventoryQuery(inventoryId, {
    skip: !userInfo,
  });

  const cityId = inventory?.city.cityId;

  const { data: userFiles } = api.useGetUserFilesQuery(cityId!, {
    skip: !cityId,
  });

  return (
    <Box backgroundColor="background.backgroundLight" paddingBottom="125px">
      <Box display="flex" mx="auto" w="full" maxW="1090px" px={4}>
        <Box w="full">
          <Box paddingTop="64px">
            <Text
              color="content.primary"
              fontWeight="bold"
              lineHeight="40"
              fontSize="headline.lg"
              fontFamily="body"
            >
              {t("settings")}
            </Text>
            <Text
              color="content.tertiary"
              fontWeight="normal"
              lineHeight="24"
              fontFamily="heading"
              fontSize="body.lg"
              letterSpacing="wide"
              marginTop="8px"
            >
              {t("settings-sub-title")}
            </Text>
          </Box>
          <Box marginTop="48px" borderBottomColor={"border.overlay"}>
            <Tabs.Root defaultValue="my-profile" variant="enclosed">
              <Tabs.List
                p={0}
                w="full"
                backgroundColor="background.backgroundLight"
              >
                <Tabs.Trigger
                  value="my-profile"
                  _selected={{
                    borderColor: "content.link",
                    borderBottomWidth: "2px",
                    boxShadow: "none",
                    fontWeight: "bold",
                    borderRadius: "0",
                    color: "content.link",
                    backgroundColor: "background.backgroundLight",
                  }}
                >
                  <Text
                    fontSize="title.md"
                    fontStyle="normal"
                    lineHeight="24px"
                  >
                    {t("my-profile")}
                  </Text>
                </Tabs.Trigger>
                <Tabs.Trigger
                  _selected={{
                    borderColor: "content.link",
                    borderBottomWidth: "2px",
                    boxShadow: "none",
                    fontWeight: "bold",
                    borderRadius: "0",
                    color: "content.link",
                    backgroundColor: "background.backgroundLight",
                  }}
                  value="my-files"
                >
                  <Text
                    fontSize="title.md"
                    fontStyle="normal"
                    lineHeight="24px"
                  >
                    {t("my-files")}
                  </Text>
                </Tabs.Trigger>
                <Tabs.Trigger
                  _selected={{
                    borderColor: "content.link",
                    borderBottomWidth: "2px",
                    boxShadow: "none",
                    fontWeight: "bold",
                    borderRadius: "0",
                    color: "content.link",
                    backgroundColor: "background.backgroundLight",
                  }}
                  value="my-inventories"
                >
                  <Text
                    fontSize="title.md"
                    fontStyle="normal"
                    lineHeight="24px"
                  >
                    {t("my-inventories")}
                  </Text>
                </Tabs.Trigger>
                {hasFeatureFlag(FeatureFlags.OAUTH_ENABLED) && (
                  <Tabs.Trigger
                    _selected={{
                      borderColor: "content.link",
                      borderBottomWidth: "2px",
                      boxShadow: "none",
                      fontWeight: "bold",
                      borderRadius: "0",
                      color: "content.link",
                      backgroundColor: "background.backgroundLight",
                    }}
                    value="my-apps"
                  >
                    <Text
                      fontSize="title.md"
                      fontStyle="normal"
                      lineHeight="24px"
                    >
                      {t("my-apps")}
                    </Text>
                  </Tabs.Trigger>
                )}
              </Tabs.List>

              <MyProfileTab t={t} userInfo={userInfo} lng={lng} />
              <MyFilesTab t={t} userFiles={userFiles!} inventory={inventory!} />
              <MyInventoriesTab
                lng={lng}
                cities={cities}
                t={t}
                defaultCityId={cityId}
              />
              {hasFeatureFlag(FeatureFlags.OAUTH_ENABLED) && (
                <MyAppsTab lng={lng} />
              )}
            </Tabs.Root>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
