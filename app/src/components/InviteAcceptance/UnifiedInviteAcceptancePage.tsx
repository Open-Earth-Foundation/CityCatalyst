"use client";

import React, { useEffect, useRef, useState, use } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { api, useAcceptInviteMutation } from "@/services/api";
import { logger } from "@/services/logger";
import { emailPattern, tokenRegex, uuidRegex } from "@/util/validation";
import { AcceptInviteResponse } from "@/util/types";
import { UseSuccessToast } from "@/hooks/Toasts";
import { useTranslation } from "@/i18n/client";
import ProgressLoader from "@/components/ProgressLoader";
import { trackEvent } from "@/lib/analytics";
import InviteSuccessModal from "./InviteSuccessModal";
import InviteErrorView from "./InviteErrorView";

export enum InviteType {
  CITY = "city",
  ORGANIZATION = "organization",
}

interface UnifiedInviteAcceptancePageProps {
  params: Promise<{ lng: string }>;
  inviteType?: InviteType;
}

type ValidatedInviteRequest =
  | {
      type: InviteType.CITY;
      token: string;
      email: string;
      cityIds: string;
    }
  | {
      type: InviteType.ORGANIZATION;
      token: string;
      email: string;
      organizationId: string;
    };

const UnifiedInviteAcceptancePage = ({ params, inviteType }: UnifiedInviteAcceptancePageProps) => {
  const { lng } = use(params);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useSession();
  const { t } = useTranslation(lng, "auth");

  const queryParams = Object.fromEntries(searchParams.entries());
  const calledOnce = useRef(false);

  // State management
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [success, setSuccess] = useState(false);
  const [inviteData, setInviteData] = useState<{
    type: InviteType;
    email: string;
    num_cities?: number;
    organization_id?: string;
    cities?: Array<{
      cityId: string;
      cityName: string;
      countryCode?: string;
    }>;
  } | null>(null);

  // API hooks
  const [acceptCityInvite] = useAcceptInviteMutation();
  const [acceptOrgInvite] = api.useAcceptOrganizationAdminInviteMutation();

  // Toast notification
  const { showSuccessToast } = UseSuccessToast({
    title: t("invite-accepted"),
    description: t("invite-accepted-details"),
    duration: 5000,
  });

  // Auto-detect invite type from URL parameters
  const detectInviteType = (): InviteType => {
    if (inviteType) return inviteType;

    const { cityIds, organizationId } = queryParams;

    if (organizationId) return InviteType.ORGANIZATION;
    if (cityIds) return InviteType.CITY;

    return InviteType.CITY; // default fallback
  };

  const currentInviteType = detectInviteType();

  const validateInput = (token: string, email: string, extraParam: string) => {
    const isValidToken = tokenRegex.test(token);
    const isValidEmail = emailPattern.test(email);

    switch (currentInviteType) {
      case InviteType.CITY:
        const cityIdsArray = extraParam.split(",");
        return isValidToken && isValidEmail && cityIdsArray.every((id) => uuidRegex.test(id));
      case InviteType.ORGANIZATION:
        return isValidToken && isValidEmail && uuidRegex.test(extraParam);
      default:
        return false;
    }
  };

  const sanitizeInput = (input: string) => {
    return input.replace(/[&<>"'\/]/g, (char) => {
      const charMap: { [key: string]: string } = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
        "/": "&#x2F;",
      };
      return charMap[char] || char;
    });
  };

  // Pure, render-time validation -- an invalid/malformed invite link is a
  // derived value, not state, so it renders the error view directly below
  // without ever needing an effect or a setState call.
  const validatedRequest = ((): ValidatedInviteRequest | null => {
    const { token, email, cityIds, organizationId } = queryParams;
    const cleanedEmail = email?.split(" ").join("+").replace(/%40/g, "@");

    if (!token || !cleanedEmail) return null;

    switch (currentInviteType) {
      case InviteType.CITY: {
        if (!cityIds || !validateInput(token, cleanedEmail, cityIds)) {
          return null;
        }
        return {
          type: InviteType.CITY,
          token: sanitizeInput(token),
          email: sanitizeInput(cleanedEmail),
          cityIds: sanitizeInput(cityIds),
        };
      }
      case InviteType.ORGANIZATION: {
        if (
          !organizationId ||
          !validateInput(token, cleanedEmail, organizationId)
        ) {
          return null;
        }
        return {
          type: InviteType.ORGANIZATION,
          token: sanitizeInput(token),
          email: sanitizeInput(cleanedEmail),
          organizationId: sanitizeInput(organizationId),
        };
      }
      default:
        return null;
    }
  })();

  useEffect(() => {
    if (!validatedRequest || calledOnce.current) return;

    if (status === "loading") return;

    if (status === "unauthenticated") {
      calledOnce.current = true;
      const callbackUrl = `${pathname}?${searchParams.toString()}`;
      router.push(`/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      return;
    }

    calledOnce.current = true;

    (async () => {
      try {
        let result;
        let trackingData: {
          event: string;
          properties: Record<string, unknown>;
        };

        if (validatedRequest.type === InviteType.CITY) {
          result = await acceptCityInvite({
            token: validatedRequest.token,
            cityIds: validatedRequest.cityIds.split(","),
            email: validatedRequest.email,
          });
          trackingData = {
            event: "collaborator_invitation_accepted",
            properties: {
              num_cities: validatedRequest.cityIds.split(",").length,
            },
          };
        } else {
          result = await acceptOrgInvite({
            token: validatedRequest.token,
            organizationId: validatedRequest.organizationId,
            email: validatedRequest.email,
          });
          trackingData = {
            event: "admin_invitation_accepted",
            properties: { organization_id: validatedRequest.organizationId },
          };
        }

        if (result?.error) {
          setError(true);
          return;
        }

        trackEvent(trackingData.event, trackingData.properties);

        let finalInviteData: {
          type: InviteType;
          email: string;
          num_cities?: number;
          organization_id?: string;
          cities?: Array<{
            cityId: string;
            cityName: string;
            countryCode?: string;
          }>;
        } = {
          type: validatedRequest.type,
          email: validatedRequest.email,
          ...trackingData.properties,
          cities: [],
        };

        // For city invites, resolve city names/flags from the accept
        // response directly -- GET /city is scoped to CityUser membership,
        // which admin invites don't create, so it can't be used here.
        const acceptedCities = (
          result.data as { cities?: AcceptInviteResponse["cities"] }
        )?.cities;
        if (validatedRequest.type === InviteType.CITY && acceptedCities) {
          finalInviteData = {
            ...finalInviteData,
            cities: acceptedCities.map((city) => ({
              cityId: city.cityId,
              cityName: city.name || "Unknown City",
              countryCode: city.countryLocode
                ?.substring(0, 2)
                .toLowerCase(),
            })),
          };
        }

        setInviteData(finalInviteData);
        setSuccess(true);
        showSuccessToast();
      } catch (err) {
        setError(true);
        logger.error(err, "Failed to accept invite");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [
    validatedRequest,
    acceptCityInvite,
    acceptOrgInvite,
    showSuccessToast,
    status,
    pathname,
    router,
    searchParams,
  ]);

  const handleSuccessClose = () => {
    setSuccess(false);
    router.push("/");
  };

  if (!validatedRequest) return <InviteErrorView lng={lng} />;
  if (isLoading) return <ProgressLoader />;
  if (error) return <InviteErrorView lng={lng} />;
  if (success) return (
    <InviteSuccessModal
      isOpen={success}
      onClose={handleSuccessClose}
      inviteData={inviteData}
      lng={lng}
    />
  );

  return null;
};

export default UnifiedInviteAcceptancePage;