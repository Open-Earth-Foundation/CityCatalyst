"use client";

import React, { useEffect, useRef, useState, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, useAcceptInviteMutation } from "@/services/api";
import { logger } from "@/services/logger";
import { emailPattern, tokenRegex, uuidRegex } from "@/util/validation";
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

const UnifiedInviteAcceptancePage = ({ params, inviteType }: UnifiedInviteAcceptancePageProps) => {
  const { lng } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
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
      flag: string;
    }>;
  } | null>(null);

  // API hooks
  const [acceptCityInvite] = useAcceptInviteMutation();
  const [acceptOrgInvite] = api.useAcceptOrganizationAdminInviteMutation();
  const [getCities] = api.useLazyGetCitiesQuery();

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

  const getCountryFlag = (countryCode: string | undefined): string => {
    if (!countryCode || countryCode.length !== 2) return "🏙️";
    
    const codePoints = countryCode
      .toUpperCase()
      .split("")
      .map(char => 127397 + char.charCodeAt(0));
    
    return String.fromCodePoint(...codePoints);
  };

  const acceptInvite = async () => {
    if (calledOnce.current) return;
    calledOnce.current = true;

    try {
      const { token, email, cityIds, organizationId } = queryParams;
      const cleanedEmail = email?.split(" ").join("+").replace(/%40/g, "@");

      if (!token || !cleanedEmail) {
        setError(true);
        setIsLoading(false);
        return;
      }

      const sanitizedToken = sanitizeInput(token);
      const sanitizedEmail = sanitizeInput(cleanedEmail);

      let result;
      let trackingData;

      switch (currentInviteType) {
        case InviteType.CITY:
          if (!cityIds || !validateInput(token, cleanedEmail, cityIds)) {
            setError(true);
            setIsLoading(false);
            return;
          }
          
          const sanitizedCityIds = sanitizeInput(cityIds);
          result = await acceptCityInvite({
            token: sanitizedToken,
            cityIds: sanitizedCityIds.split(","),
            email: sanitizedEmail,
          });

          trackingData = {
            event: "collaborator_invitation_accepted",
            properties: { num_cities: sanitizedCityIds.split(",").length }
          };
          break;

        case InviteType.ORGANIZATION:
          if (!organizationId || !validateInput(token, cleanedEmail, organizationId)) {
            setError(true);
            setIsLoading(false);
            return;
          }

          const sanitizedOrganizationId = sanitizeInput(organizationId);
          result = await acceptOrgInvite({
            token: sanitizedToken,
            organizationId: sanitizedOrganizationId,
            email: sanitizedEmail,
          });

          trackingData = {
            event: "admin_invitation_accepted",
            properties: { organization_id: sanitizedOrganizationId }
          };
          break;

        default:
          setError(true);
          setIsLoading(false);
          return;
      }

      if (result?.error) {
        setError(true);
      } else {
        // Track the event
        if (trackingData) {
          trackEvent(trackingData.event, trackingData.properties);
        }

        // Prepare invite data
        let finalInviteData: {
          type: InviteType;
          email: string;
          num_cities?: number;
          organization_id?: string;
          cities?: Array<{
            cityId: string;
            cityName: string;
            flag: string;
          }>} = {
            type: currentInviteType,
            email: sanitizedEmail,
            ...trackingData?.properties,
            cities: []
        };

        // For city invites, fetch city data to show names and flags
        if (currentInviteType === InviteType.CITY && cityIds) {
          try {
            const citiesResult = await getCities({});
            if (citiesResult.data) {
              const allCities = citiesResult.data;
              const invitedCityIds = sanitizeInput(cityIds).split(",");
              const invitedCities = invitedCityIds.map(cityId => {
                const city = allCities.find((c: any) => c.cityId === cityId);
                return {
                  cityId,
                  cityName: city?.name || "Unknown City",
                  flag: getCountryFlag(city?.countryLocode)
                };
              });
              
              finalInviteData = {
                ...finalInviteData,
                cities: invitedCities
              };
            }
          } catch (error) {
            logger.error("Failed to fetch city data for invite:", error);
          }
        }

        setInviteData(finalInviteData);
        setSuccess(true);
        showSuccessToast();
      }
    } catch (error) {
      setError(true);
      logger.error("Failed to accept invite:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    acceptInvite();
  }, [queryParams]);

  const handleSuccessClose = () => {
    setSuccess(false);
    router.push("/");
  };

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