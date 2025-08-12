"use client";

import {
  Box,
  Heading,
} from "@chakra-ui/react";
import { useTranslation } from "@/i18n/client";
import React, { use } from "react";
import { api } from "@/services/api";
import ProgressLoader from "@/components/ProgressLoader";
import OAuthClientCard from "@/app/[lng]/admin/OAuthClientCard";


const OAuthClientList = (props: { lng: string }) => {
  const { lng } = props;
  const { t } = useTranslation(lng, "admin");

  const { data: clientsData, isLoading: isClientsDataLoading } =
    api.useGetClientsQuery();

  return <Box>
      <Heading>{t("oauth-clients-heading")}</Heading>
      <Box>
        {(isClientsDataLoading)
         ? <ProgressLoader />
         : (!clientsData || clientsData.length === 0)
           ? <Box>{t("oauth-no-clients")}</Box>
           : clientsData?.map(client =>
              <OAuthClientCard
                key={client.clientId}
                lng={lng}
                client={client} />)
        }
      </Box>
    </Box>
}

export default OAuthClientList;