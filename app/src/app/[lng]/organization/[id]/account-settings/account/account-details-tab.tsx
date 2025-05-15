import { useParams } from "next/navigation";
import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";
import AccountDetailsTabPanel from "@/components/Tabs/MyProfileTab/AccountDetailsTabPanel";

const AccountDetailsTab = () => {
  const { lng } = useParams();
  const { t } = useTranslation(lng as string, "settings");

  const { data: userInfo, isLoading: isUserInfoLoading } =
    api.useGetUserInfoQuery();
  return (
    <AccountDetailsTabPanel t={t} userInfo={userInfo} showTitle />
  );
};

export default AccountDetailsTab;
