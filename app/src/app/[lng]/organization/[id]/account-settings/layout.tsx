"use client";
import { use } from "react";

import { NavigationBar } from "@/components/navigation-bar";
import { Toaster } from "@/components/ui/toaster";
import { Box } from "@chakra-ui/react";
import { useGetOrganizationQuery } from "@/services/api";
import ProgressLoader from "@/components/ProgressLoader";
import { useEffect } from "react";
import { useOrganizationContext } from "@/hooks/organization-context-provider/use-organizational-context";
import { useTheme } from "next-themes";

export default function OrganizationSettingsLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string; id: string }>;
}) {
  const { lng, id } = use(props.params);

  const { data: orgData, isLoading: isOrgDataFetching } =
    useGetOrganizationQuery(id, {
      skip: !id,
    });

  const { setOrganization, organization } = useOrganizationContext();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (orgData) {
      const logoUrl = orgData?.logoUrl ?? null;
      const active = orgData?.active ?? true;

      if (
        organization?.logoUrl !== logoUrl ||
        organization?.active !== active
      ) {
        setOrganization({ logoUrl, active });
      }
      setTheme(orgData?.theme?.themeKey ?? "blue_theme");
    } else {
      setTheme("blue_theme");
    }
  }, [isOrgDataFetching, orgData, setOrganization, setTheme]);

  if (isOrgDataFetching) {
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
        {props.children}
      </Box>
    </Box>
  );
}
