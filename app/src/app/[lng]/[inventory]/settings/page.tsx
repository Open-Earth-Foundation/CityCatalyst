"use client";

import React, { useState } from "react";
import { useTranslation } from "@/i18n/client";
import { NavigationBar } from "@/components/navigation-bar";
import { Box, Tabs, Text } from "@chakra-ui/react";

import { useSession } from "next-auth/react";

import MyProfileTab from "@/components/Tabs/my-profile-tab";
import MyFilesTab from "@/components/Tabs/my-files-tab";
import MyInventoriesTab from "@/components/Tabs/my-inventories-tab";
import { api } from "@/services/api";
import { useParams, useSearchParams } from "next/navigation";

export type ProfileInputs = {
  name: string;
  email: string;
  city: string;
  role: string;
  locode: string;
  userId: string;
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

const tabIds = ["my-profile", "my-files", "my-inventories"];

export default function Settings({
  params: { lng },
}: {
  params: { lng: string };
}) {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();

  const paramValue = searchParams.get("tabIndex");
  const tabIndex = paramValue ? Number(paramValue) : 0;

  const [selectedTab, setSelectedTab] = useState<string | null>(
    tabIds[tabIndex],
  );

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

  const { data: cityUsers } = api.useGetCityUsersQuery(
    { cityId: cityId! },
    { skip: !cityId },
  );

  const { data: userFiles } = api.useGetUserFilesQuery(cityId!, {
    skip: !cityId,
  });

  return (
    <Box backgroundColor="background.backgroundLight" paddingBottom="125px">
      <Box className="flex mx-auto w-[1090px] h-[100vh]">
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
            <Tabs.Root
              value={selectedTab}
              onValueChange={(e) => setSelectedTab(e.value)}
            >
              <Tabs.List>
                <Tabs.Trigger value="my-profile">
                  <Text
                    fontSize="title.md"
                    fontStyle="normal"
                    lineHeight="24px"
                  >
                    {t("my-profile")}
                  </Text>
                </Tabs.Trigger>
                <Tabs.Trigger value="my-files">
                  <Text
                    fontSize="title.md"
                    fontStyle="normal"
                    lineHeight="24px"
                  >
                    {t("my-files")}
                  </Text>
                </Tabs.Trigger>
                <Tabs.Trigger value="my-inventories">
                  <Text
                    fontSize="title.md"
                    fontStyle="normal"
                    lineHeight="24px"
                  >
                    {t("my-inventories")}
                  </Text>
                </Tabs.Trigger>
              </Tabs.List>

              <Tabs.Content value="my-profile">
                <MyProfileTab
                  lng={lng}
                  session={session}
                  status={status}
                  t={t}
                  userInfo={userInfo}
                  cities={cities}
                  cityUsers={cityUsers}
                  defaultCityId={cityId}
                />
              </Tabs.Content>
              <Tabs.Content value="my-files">
                <MyFilesTab
                  lng={lng}
                  session={session}
                  status={status}
                  t={t}
                  userInfo={userInfo!}
                  userFiles={userFiles!}
                  inventory={inventory!}
                />
              </Tabs.Content>
              <Tabs.Content value="my-inventories">
                <MyInventoriesTab
                  lng={lng}
                  session={session}
                  status={status}
                  cities={cities}
                  t={t}
                  defaultCityId={cityId}
                />
              </Tabs.Content>
            </Tabs.Root>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
