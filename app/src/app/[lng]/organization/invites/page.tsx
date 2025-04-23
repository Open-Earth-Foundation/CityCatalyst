"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Center, ProgressCircle } from "@chakra-ui/react";
import { api, useAcceptInviteMutation } from "@/services/api";
import { logger } from "@/services/logger";
import InviteErrorView from "./InviteErrorView";
import { emailPattern, tokenRegex, uuidRegex } from "@/util/validation";
import { UseSuccessToast } from "@/hooks/Toasts";
import { useTranslation } from "@/i18n/client";
import ProgressLoader from "@/components/ProgressLoader";

const AcceptInvitePage = ({ params: { lng } }: { params: { lng: string } }) => {
  const searchParams = useSearchParams();
  const { t } = useTranslation(lng, "auth");
  const { showSuccessToast } = UseSuccessToast({
    title: t("invite-accepted"),
    description: t("invite-accepted-org-details"),
    duration: 5000,
  });
  const queryParams = Object.fromEntries(searchParams.entries());
  const [acceptInvite, { isLoading, isError }] =
    api.useAcceptOrganizationAdminInviteMutation();
  const calledOnce = useRef(false);
  const router = useRouter();
  const [error, setError] = useState(false);

  const validateInput = (
    token: string,
    email: string,
    organizationId: string,
  ) => {
    return (
      tokenRegex.test(token) &&
      emailPattern.test(email) &&
      uuidRegex.test(organizationId)
    );
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

  useEffect(() => {
    const accept = async () => {
      if (!calledOnce.current) {
        calledOnce.current = true;
        const { token, email, organizationId } = queryParams;

        if (
          token &&
          email &&
          organizationId &&
          validateInput(token, email, organizationId)
        ) {
          try {
            const sanitizedToken = sanitizeInput(token);
            const sanitizedEmail = sanitizeInput(email);
            const sanitizedCityIds = sanitizeInput(organizationId);

            const { error } = await acceptInvite({
              token: sanitizedToken,
              organizationId: organizationId,
              email: sanitizedEmail,
            });

            if (!!error) {
              setError(true);
            } else {
              showSuccessToast();
              router.push(`/`);
            }
          } catch (error) {
            setError(true);
            logger.error("Failed to accept invite:", error);
          }
        } else {
          setError(true);
        }
      }
    };

    accept();
  }, [queryParams, acceptInvite, router]);

  if (isLoading) return <ProgressLoader />;

  if (isError || error) return <InviteErrorView lng={lng} />;

  return null;
};

export default AcceptInvitePage;
