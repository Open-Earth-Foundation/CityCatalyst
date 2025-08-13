"use client";

import {
  Box,
  Button,
  Icon,
  Flex
} from "@chakra-ui/react";
import { useTranslation } from "@/i18n/client";
import React, { use } from "react";
import { api } from "@/services/api";
import ProgressLoader from "@/components/ProgressLoader";
import OAuthClientCard from "@/app/[lng]/admin/OAuthClientCard";
import { TitleLarge } from "@/components/Texts/Title";
import { ButtonMedium } from "@/components/Texts/Button";
import { BsPlus } from "react-icons/bs";

const OAuthClientList = (props: { lng: string }) => {
  const { lng } = props;
  const { t } = useTranslation(lng, "admin");

  const { data: clientsData, isLoading: isClientsDataLoading } =
    api.useGetClientsQuery();

  const handleAddClient = () => alert('Adding client');

  return <Box>
      <Flex>
        <Box>
          <TitleLarge>{t("oauth-clients-heading")}</TitleLarge>
          <Box>{t("oauth-clients-subtitle")}</Box>
        </Box>
        <Button
          onClick={handleAddClient}
          variant="ghost"
          h="48px"
          bg="interactive.secondary"
          color="base.light"
          ml="auto">
          <Icon as={BsPlus} h={8} w={8} />
          {t("oauth-clients-add-button")}
        </Button>
      </Flex>
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