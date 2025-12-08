"use client";

import { NavigationBar } from "@/components/navigation-bar";
import { Toaster } from "@/components/ui/toaster";
import { Box } from "@chakra-ui/react";
import { useGetOrganizationQuery } from "@/services/api";
import ProgressLoader from "@/components/ProgressLoader";
import { use } from "react";
import { useTheme } from "next-themes";
import { useEffect } from "react";
import {
  useOrganizationContext,
  hasOrganizationChanged,
  normalizeOrganizationState,
} from "@/hooks/organization-context-provider/use-organizational-context";

export default function CitiesLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(props.params);
  const { children } = props;

  const { setOrganization, organization } = useOrganizationContext();
  const { setTheme, theme } = useTheme();

  // Get organization data using organizationId from context
  const { data: orgData, isLoading: isOrgDataLoading } =
    useGetOrganizationQuery(organization?.organizationId!, {
      skip: !organization?.organizationId,
    });

  useEffect(() => {
    if (orgData) {
      const newOrgState = normalizeOrganizationState(orgData);

      if (hasOrganizationChanged(organization, newOrgState)) {
        setOrganization(newOrgState);
      }
      setTheme(orgData?.theme?.themeKey ?? "blue_theme");
      console.log("orgData", orgData);
      console.log("theme", theme);
    } else {
      setTheme("blue_theme");
    }
  }, [isOrgDataLoading, orgData, organization, setOrganization, setTheme]);

  if (isOrgDataLoading) {
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
