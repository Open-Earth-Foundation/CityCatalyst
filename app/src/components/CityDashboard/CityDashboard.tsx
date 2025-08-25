import { useTranslation } from "@/i18n/client";
import { CheckUserSession } from "@/util/check-user-session";
import Cookies from "js-cookie";
import { useParams, useRouter } from "next/navigation";

import {
  api,
  useGetMostRecentCityPopulationQuery,
  useGetModulesQuery,
  useGetProjectModulesQuery,
} from "@/services/api";

const CityDashboard = ({
  lng,
  isPublic,
}: {
  lng: string;
  isPublic: boolean;
  cityId?: string;
}) => {
  const { t } = useTranslation(lng, "dashboard");
  const cookieLanguage = Cookies.get("i18next");
  const router = useRouter();

  // Check if user is authenticated otherwise route to login page
  isPublic || CheckUserSession();
  const language = cookieLanguage ?? lng;
  const { cityId, year } = useParams();

  const { data: userInfo, isLoading: isUserInfoLoading } =
    api.useGetUserInfoQuery();

  // make sure that the inventory ID is using valid values
  let cityIdFromParam = (cityId as string) ?? userInfo?.defaultCityId;


  

  
};

export default CityDashboard;
