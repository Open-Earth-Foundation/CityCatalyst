"use client";

import React, { useEffect, useRef, useState, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAcceptInviteMutation } from "@/services/api";
import { logger } from "@/services/logger";
import InviteErrorView from "./InviteErrorView";
import { emailPattern, tokenRegex, uuidRegex } from "@/util/validation";
import ProgressLoader from "@/components/ProgressLoader";

const AcceptInvitePage = (props: { params: Promise<{ lng: string }> }) => {
  const { lng } = use(props.params);

  const searchParams = useSearchParams();
  const queryParams = Object.fromEntries(searchParams.entries());
  const [acceptInvite, { isLoading, isError }] = useAcceptInviteMutation();
  const calledOnce = useRef(false);
  const router = useRouter();
  const [error, setError] = useState(false);

  const validateInput = (token: string, email: string, cityIds: string) => {
    const cityIdsArray = cityIds.split(",");
    return (
      tokenRegex.test(token) &&
      emailPattern.test(email) &&
      cityIdsArray.every((id) => uuidRegex.test(id))
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
        const { token, email, cityIds } = queryParams;
        const cleanedEmail = email?.split(" ").join("+");
        if (
          token &&
          cleanedEmail &&
          cityIds &&
          validateInput(token, cleanedEmail, cityIds)
        ) {
          try {
            const sanitizedToken = sanitizeInput(token);
            const sanitizedEmail = sanitizeInput(cleanedEmail);
            const sanitizedCityIds = sanitizeInput(cityIds);

            const { error } = await acceptInvite({
              token: sanitizedToken,
              cityIds: sanitizedCityIds.split(","),
              email: sanitizedEmail,
            });

            if (!!error) {
              setError(true);
            } else {
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
