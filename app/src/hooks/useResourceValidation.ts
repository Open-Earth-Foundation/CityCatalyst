import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/services/api";
import ProgressLoader from "@/components/ProgressLoader";

interface UseResourceValidationOptions {
  resourceId: string | undefined;
  resourceQuery: any; // RTK Query hook result
  lng: string;
  resourceType: 'inventory' | 'city';
  fallbackRoute?: string;
}

interface UseResourceValidationReturn {
  userInfo: any;
  resourceData: any;
  isLoading: boolean;
  shouldRender: boolean;
  LoadingComponent: React.ComponentType;
}

export function useResourceValidation({
  resourceId,
  resourceQuery,
  lng,
  resourceType,
  fallbackRoute
}: UseResourceValidationOptions): UseResourceValidationReturn {
  const router = useRouter();
  const { data: userInfo, isLoading: userInfoLoading } = api.useGetUserInfoQuery();
  
  const {
    data: resourceData,
    error: resourceError,
    isLoading: resourceLoading,
  } = resourceQuery;

  const isLoading = userInfoLoading || resourceLoading;

  useEffect(() => {
    if (isLoading) return;

    // If resource doesn't exist or user doesn't have access, redirect appropriately
    if (resourceError || !resourceData) {
      if (resourceType === 'inventory') {
        if (userInfo?.defaultInventoryId) {
          // Redirect to default inventory
          router.replace(`/${lng}/${userInfo.defaultInventoryId}`);
        } else if (userInfo?.defaultCityId) {
          // Redirect to default city
          router.replace(`/${lng}/cities/${userInfo.defaultCityId}`);
        } else {
          // Redirect to onboarding
          router.replace(`/${lng}/onboarding`);
        }
      } else if (resourceType === 'city') {
        if (userInfo?.defaultCityId) {
          // Redirect to default city
          router.replace(`/${lng}/cities/${userInfo.defaultCityId}`);
        } else {
          // Redirect to cities onboarding
          router.replace(`/${lng}/cities/onboarding`);
        }
      }
    }
  }, [
    resourceError,
    resourceData,
    userInfo,
    isLoading,
    lng,
    router,
    resourceType,
  ]);

  const shouldRender = !isLoading && !resourceError && !!resourceData;

  return {
    userInfo,
    resourceData,
    isLoading,
    shouldRender,
    LoadingComponent: ProgressLoader,
  };
}
