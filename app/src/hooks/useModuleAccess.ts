import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/i18n/client";
import { toaster } from "@/components/ui/toaster";
import { useGetCityModuleAccessQuery } from "@/services/api";

interface UseModuleAccessProps {
  cityId: string;
  moduleId: string;
  lng: string;
  fallbackPath?: string;
}

export const useModuleAccess = ({
  cityId,
  moduleId,
  lng,
  fallbackPath,
}: UseModuleAccessProps) => {
  const { t } = useTranslation(lng, "not-found");
  const router = useRouter();
  
  const { data, isLoading, error, refetch } = useGetCityModuleAccessQuery({
    cityId,
    moduleId,
  });

  useEffect(() => {
    if (!isLoading && !data?.hasAccess) {
      toaster.error({
        title: t("not-found-description"),
      });
      const redirectPath = fallbackPath || `/${lng}`;
      router.push(redirectPath);
    }
  }, [data, isLoading, router, lng, t, fallbackPath]);

  return {
    hasAccess: data?.hasAccess || false,
    isAccessLoading: isLoading,
    error,
    refetch,
  };
}; 