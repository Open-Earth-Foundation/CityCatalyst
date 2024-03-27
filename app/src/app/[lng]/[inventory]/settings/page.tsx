"use client";

import React, { useState } from "react";
import { useTranslation } from "@/i18n/client";
import { NavigationBar } from "@/components/navigation-bar";
import { Box, Tab, TabList, TabPanels, Tabs, Text } from "@chakra-ui/react";

import { useSession } from "next-auth/react";

import MyProfileTab from "@/components/Tabs/my-profile-tab";
import MyFilesTab from "@/components/Tabs/my-files-tab";
import MyInventoriesTab from "@/components/Tabs/my-inventories-tab";
import { api } from "@/services/api";
import { useParams } from "next/navigation";

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

export default function Settings({
  params: { lng },
}: {
  params: { lng: string };
}) {
  const { data: session, status } = useSession();

  const { t } = useTranslation(lng, "settings");

  const { data: userInfo, isLoading: isUserInfoLoading } =
    api.useGetUserInfoQuery();

  const { data: cities, isLoading: isCitiesLoading } = api.useGetCitiesQuery({
    skip: !userInfo,
  });

  const { inventory: cityParam } = useParams();
  const inventoryId = cityParam as string;

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
    skip: !userInfo,
  });

  console.log(inventory?.year);

  return (
    <Box backgroundColor="background.backgroundLight" paddingBottom="125px">
      <NavigationBar lng={lng} />
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
            <Tabs>
              <TabList>
                <Tab>
                  <Text
                    fontSize="title.md"
                    fontStyle="normal"
                    lineHeight="24px"
                  >
                    {t("my-profile")}
                  </Text>
                </Tab>
                <Tab>
                  <Text
                    fontSize="title.md"
                    fontStyle="normal"
                    lineHeight="24px"
                  >
                    {t("my-files")}
                  </Text>
                </Tab>
                <Tab>
                  <Text
                    fontSize="title.md"
                    fontStyle="normal"
                    lineHeight="24px"
                  >
                    {t("my-inventories")}
                  </Text>
                </Tab>
              </TabList>

              <TabPanels className="-ml-4">
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
                <MyFilesTab
                  lng={lng}
                  session={session}
                  status={status}
                  t={t}
                  userInfo={userInfo!}
                  userFiles={userFiles!}
                />
                <MyInventoriesTab
                  lng={lng}
                  session={session}
                  status={status}
                  cities={cities}
                  t={t}
                  defaultCityId={cityId}
                />
              </TabPanels>
            </Tabs>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
