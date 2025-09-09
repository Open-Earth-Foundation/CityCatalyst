"use client";

import React, { useEffect } from "react";
import { api, useGetUserAccessStatusQuery } from "@/services/api";
import { usePathname } from "next/navigation";
import ProgressLoader from "@/components/ProgressLoader";
import NoAccess from "@/components/NoAccess";
import { Roles } from "@/util/types";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";
import { trackPageView } from "@/lib/analytics";

export function ClientRootLayout({
  lng,
  children,
}: {
  children: React.ReactNode;
  lng: string;
}) {
  const pathname = usePathname();
  const isPublic = pathname.includes("public");
  const isInvitePage = pathname.includes("invites");
  const isAuthPage = pathname.includes("auth");
  const EnterpriseMode = hasFeatureFlag(FeatureFlags.ENTERPRISE_MODE);

  // Track page views when pathname changes
  useEffect(() => {
    trackPageView(pathname);
  }, [pathname]);
  const { data: userInfo, isLoading: isUserInfoLoading } =
    api.useGetUserInfoQuery(undefined, {
      skip: isPublic || isAuthPage || !EnterpriseMode || isInvitePage,
    });

  const { data: userAccessStatus, isLoading: isLoadingUserAccessStatus } =
    useGetUserAccessStatusQuery(
      {},
      {
        skip: isPublic || isAuthPage || !EnterpriseMode || isInvitePage,
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
      userAccessStatus?.isCollaborator ||
      userInfo?.role === Roles.Admin ||
      // TODO: Remove this once we have a way to handle new user access on dev
      userInfo?.role === Roles.User
    )
  ) {
    return <NoAccess lng={lng} email={userInfo?.email as string} />;
  }

  return <>{children}</>;
}

export default ClientRootLayout;
