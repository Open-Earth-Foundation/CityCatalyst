import { useParams } from "next/navigation";
import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";
import AccountDetailsTabPanel from "@/components/Tabs/MyProfileTab/AccountDetailsTabPanel";
import ProgressLoader from "@/components/ProgressLoader";
import { Box } from "@chakra-ui/react";

const AccountDetailsTab = () => {
  const { lng } = useParams();
  const { t } = useTranslation(lng as string, "settings");

  const { data: userInfo, isLoading: isUserInfoLoading } =
    api.useGetUserInfoQuery();
  return (
    isUserInfoLoading ? (
      <Box backgroundColor="white" p={6}>
        <ProgressLoader />
      </Box>
    ) : (
      <AccountDetailsTabPanel t={t} userInfo={userInfo} showTitle />
    )
  );
};

export default AccountDetailsTab;
