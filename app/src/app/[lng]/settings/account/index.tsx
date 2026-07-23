import { Box, Tabs } from "@chakra-ui/react";
import { TFunction } from "i18next";

import { TitleMedium } from "@/components/package/Texts/Title";
import PlanDetailsBox from "@/components/PlanDetailsBox";
import ProgressLoader from "@/components/ProgressLoader";
import TabContent from "@/components/ui/tab-content";
import TabTrigger from "@/components/ui/tab-trigger";
import { api } from "@/services/api";
import AccountDetailsTab from "./AccountDetailsTab";
import ManagePasswordTab from "./ManagePasswordTab";
import PreferencesTab from "./PreferencesTab";
import BrandSettingsTab from "./BrandSettingsTab";

const AccountSettingsTab = ({ t }: { t: TFunction }) => {
  const { data: userAccessStatus } = api.useGetUserAccessStatusQuery({});
  const { data: organization } = api.useGetOrganizationQuery(
    userAccessStatus?.organizationId as string,
    {
      skip: !userAccessStatus?.organizationId,
    },
  );

  const { data: userInfo, isLoading: isUserInfoLoading } =
    api.useGetUserInfoQuery();

  return (
    <Tabs.Root
      display="flex"
      w="full"
      flexDirection="row"
      variant="subtle"
      gap="36px"
      defaultValue="account-details"
    >
      <Tabs.List display="flex" flexDirection="column" gap="12px">
        <TabTrigger value="account-details">{t("account-details")}</TabTrigger>
        <TabTrigger value="brand-settings">{t("brand-settings")}</TabTrigger>
        <TabTrigger value="manage-password">{t("manage-password")}</TabTrigger>
        <TabTrigger value="preferences">{t("preferences")}</TabTrigger>
      </Tabs.List>
      <TabContent value="brand-settings">
        <BrandSettingsTab t={t} />
      </TabContent>
      <TabContent value="account-details">
        {isUserInfoLoading ? (
          <ProgressLoader />
        ) : (
          <AccountDetailsTab t={t} userInfo={userInfo} showTitle />
        )}
        {userAccessStatus?.isOrgOwner && (
          <Box backgroundColor="white" p={6} marginTop={4}>
            <TitleMedium color="content.secondary">
              {t("plan-details")}
            </TitleMedium>
            <PlanDetailsBox organization={organization} />
          </Box>
        )}
      </TabContent>
      <TabContent value="manage-password">
        <Box bg="background.default">
          <ManagePasswordTab t={t} />
        </Box>
      </TabContent>
      <TabContent value="preferences">
        <PreferencesTab t={t} userInfo={userInfo} />
      </TabContent>
    </Tabs.Root>
  );
};

export default AccountSettingsTab;
