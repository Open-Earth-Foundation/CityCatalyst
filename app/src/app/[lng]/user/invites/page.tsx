"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Center, CircularProgress } from "@chakra-ui/react";
import { useAcceptInviteMutation } from "@/services/api";
import { logger } from "@/services/logger";
import InviteErrorView from "./InviteErrorView";
import { useRouter } from "next/navigation";

const AcceptInvitePage = ({ params: { lng } }: { params: { lng: string } }) => {
  const searchParams = useSearchParams();
  const queryParams = Object.fromEntries(searchParams.entries());
  const [acceptInvite, { isLoading, isError }] = useAcceptInviteMutation();
  const calledOnce = useRef(false);
  const { token, email, cityIds } = queryParams;
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    const accept = async () => {
      if (token && email && cityIds && !calledOnce.current) {
        calledOnce.current = true;
        try {
          const { data, error } = await acceptInvite({
            token: token,
            cityIds: cityIds.split(","),
            email: email,
          });
          if (!data?.success || !!error) {
            setError(true);
          }
        } catch (error) {
          setError(true);
          logger.error("Failed to accept invite:", error);
        }
      }
    };

    accept();
  }, [token, email, cityIds, acceptInvite]);

  if (isLoading)
    return (
      <Center>
        <CircularProgress isIndeterminate />
      </Center>
    );

  if (isError || error) return <InviteErrorView lng={lng} />;

  router.push(`/`);
};

export default AcceptInvitePage;
