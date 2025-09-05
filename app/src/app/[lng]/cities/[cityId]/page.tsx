"use client";
import { use, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/services/api";
import HomePage from "@/components/HomePageJN/HomePage";

export default function PrivateHome(props: {
  params: Promise<{ lng: string }>;
}) {
  const { lng } = use(props.params);
  const router = useRouter();
  const { cityId } = useParams();

  const cityIdValue = Array.isArray(cityId) ? cityId[0] : cityId;

  // Get user info to check for default city
  const { data: userInfo, isLoading: userInfoLoading } =
    api.useGetUserInfoQuery();

  // Get city data to validate if the city exists and user has access
  const {
    data: city,
    error: cityError,
    isLoading: cityLoading,
  } = api.useGetCityQuery(cityIdValue!, { skip: !cityIdValue });

  useEffect(() => {
    if (userInfoLoading || cityLoading) return;

    // If city doesn't exist or user doesn't have access, redirect to default city
    if (cityError || !city) {
      if (userInfo?.defaultCityId) {
        router.replace(`/${lng}/cities/${userInfo.defaultCityId}`);
      } else {
        router.replace(`/${lng}/cities/onboarding`);
      }
    }
  }, [cityError, city, userInfo, userInfoLoading, cityLoading, lng, router]);

  // Show loading state while validating
  if (userInfoLoading || cityLoading) {
    return <div>Loading...</div>;
  }

  // If city doesn't exist, don't render (will redirect)
  if (cityError || !city) {
    return null;
  }

  return <HomePage lng={lng} isPublic={false} />;
}
