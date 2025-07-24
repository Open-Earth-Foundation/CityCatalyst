import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Roles } from "@/util/types";
import { toaster } from "@/components/ui/toaster";
import type { TFunction } from "i18next";

export function useAdminGuard(lng: string, t: TFunction) {
  const { data } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (data?.user.role !== Roles.Admin) {
      toaster.error({
        title: t("not-authorized"),
      });
      const REDIRECT_DELAY_MS = 2000;
      setTimeout(() => {
        const fallbackPath = `/${lng}`;
        router.push(fallbackPath);
      }, REDIRECT_DELAY_MS);
    }
  }, [data?.user.role, lng, router, t]);

  return data?.user.role === Roles.Admin;
} 