"use client";

import React from "react";
import { api, useGetUserAccessStatusQuery } from "@/services/api";
import { usePathname } from "next/navigation";
import ProgressLoader from "@/components/ProgressLoader";
import NoAccess from "@/components/NoAccess";
import { Roles } from "@/util/types";
import { hasFeatureFlag } from "@/util/feature-flags";

export function ClientRootLayout({
  lng,
  children,
}: {
  children: React.ReactNode;
  lng: string;
}) {
  const pathname = usePathname();
  const isPublic = pathname.includes("public");
  const isAuthPage = pathname.includes("auth");
  const nonEnterpriseMode = hasFeatureFlag("NEXT_PUBLIC_NON_ENTERPRISE_MODE");
  const { data: userInfo, isLoading: isUserInfoLoading } =
    api.useGetUserInfoQuery();

  const { data: userAccessStatus, isLoading: isLoadingUserAccessStatus } =
    useGetUserAccessStatusQuery(
      {},
      {
        skip: isPublic || isAuthPage || nonEnterpriseMode,
      },
    );

  if (isUserInfoLoading || isLoadingUserAccessStatus) {
    return <ProgressLoader />;
  }

  if (
    userAccessStatus &&
    !(
      userAccessStatus?.isProjectAdmin ||
      userAccessStatus?.isOrgOwner ||
      userAccessStatus?.isOrgOwner ||
      userInfo?.role === Roles.Admin
    )
  ) {
    return <NoAccess lng={lng} email={userInfo?.email as string} />;
  }

  return <>{children}</>;
}

export default ClientRootLayout;
