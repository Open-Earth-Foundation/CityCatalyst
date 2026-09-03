import { Box, Heading, Tabs, Text } from "@chakra-ui/react";
import { TFunction } from "i18next";

import PlanDetailsBox from "@/components/PlanDetailsBox";
import ProgressLoader from "@/components/ProgressLoader";
import TabContent from "@/components/ui/tab-content";
import TabTrigger from "@/components/ui/tab-trigger";
import { api } from "@/services/api";
import AccountDetailsTab from "./AccountDetailsTab";
import ManagePasswordTab from "./ManagePasswordTab";
import PreferencesTab from "./PreferencesTab";
import BrandSettingsTab from "./BrandSettingsTab";
import { UserRole } from "@/util/types";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useOrganizationContext } from "@/hooks/organization-context-provider/use-organizational-context";

const AccountSettingsTab = ({ t }: { t: TFunction }) => {
  const { organization: orgContext } = useOrganizationContext();
  const selectedOrganization = orgContext?.organizationId;
  const { data: organization, isLoading: isOrganizationLoading } =
    api.useGetOrganizationQuery(selectedOrganization!, {
      skip: !selectedOrganization,
    });
  const { userRole } = useUserPermissions({
    organizationId: organization?.organizationId,
  });

  const { data: userInfo, isLoading: isUserInfoLoading } =
    api.useGetUserInfoQuery();

  return (
    <Box>
      <Box
        w="full"
        display="flex"
        alignItems="center"
        justifyContent="space-between"
      >
        <Box w="full">
          <Box mb="48px">
            <Heading
              fontSize="headline.sm"
              mb={4}
              fontWeight="semibold"
              lineHeight="32px"
              fontStyle="normal"
              textTransform="capitalize"
              color="content.secondary"
            >
              {t("account")}
            </Heading>
            <Text
              fontSize="body.lg"
              fontFamily="body"
              fontWeight="normal"
              lineHeight="16px"
              color="content.tertiary"
            >
              {t("account-description")}
            </Text>
          </Box>
          <Tabs.Root
            display="flex"
            w="full"
            flexDirection="row"
            variant="subtle"
            gap="36px"
            defaultValue="account-details"
          >
            <Tabs.List display="flex" flexDirection="column" gap="12px">
              <TabTrigger value="account-details">
                {t("account-details")}
              </TabTrigger>
              {userRole === UserRole.ORG_ADMIN && (
                <TabTrigger value="brand-settings">
                  {t("brand-settings")}
                </TabTrigger>
              )}
              <TabTrigger value="manage-password">{t("password")}</TabTrigger>
              <TabTrigger value="preferences">{t("preferences")}</TabTrigger>
            </Tabs.List>
            {userRole === UserRole.ORG_ADMIN && (
              <TabContent value="brand-settings" p={0}>
                {isOrganizationLoading ? (
                  <ProgressLoader />
                ) : (
                  <BrandSettingsTab t={t} organization={organization} />
                )}
              </TabContent>
            )}
            <TabContent value="account-details" p={0} gap="24px">
              {isUserInfoLoading ? (
                <ProgressLoader />
              ) : (
                <AccountDetailsTab t={t} userInfo={userInfo} showTitle />
              )}
              {userRole === UserRole.ORG_ADMIN && (
                <PlanDetailsBox organization={organization} />
              )}
            </TabContent>
            <TabContent value="manage-password" p={0}>
              <Box bg="background.default">
                <ManagePasswordTab t={t} />
              </Box>
            </TabContent>
            <TabContent value="preferences" p={0}>
              <PreferencesTab t={t} userInfo={userInfo} />
            </TabContent>
          </Tabs.Root>
        </Box>
      </Box>
    </Box>
  );
};

export default AccountSettingsTab;
