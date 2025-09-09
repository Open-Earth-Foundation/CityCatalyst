"use client";

import { NavigationBar } from "@/components/navigation-bar";
import { Toaster } from "@/components/ui/toaster";
import { Box } from "@chakra-ui/react";
import { api, useGetOrganizationForCityQuery } from "@/services/api";
import ProgressLoader from "@/components/ProgressLoader";
import { use } from "react";
import { useTheme } from "next-themes";
import { useEffect } from "react";

export default function CitiesLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(props.params);
  const { children } = props;

  const { data: userInfo, isLoading: isUserInfoLoading } =
    api.useGetUserInfoQuery();

  // Get organization data for the user's default city
  const { data: cityOrgData, isLoading: isCityOrgDataLoading } =
    useGetOrganizationForCityQuery(userInfo?.defaultCityId!, {
      skip: !userInfo?.defaultCityId,
    });

  const { setTheme } = useTheme();

  useEffect(() => {
    if (cityOrgData) {
      setTheme(cityOrgData?.theme?.themeKey ?? ("blue_theme" as string));
    } else {
      setTheme("blue_theme");
    }
  }, [cityOrgData, setTheme]);

  if (isUserInfoLoading || isCityOrgDataLoading) {
    return <ProgressLoader />;
  }

  return (
    <Box
      h="full"
      display="flex"
      flexDirection="column"
      bg="background.backgroundLight"
    >
      <NavigationBar showMenu lng={lng} />
      <Toaster />
      <Box w="full" h="full">
        {children}
      </Box>
    </Box>
  );
}
