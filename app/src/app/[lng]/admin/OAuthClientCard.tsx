"use client";

import {
  Box
} from "@chakra-ui/react";
import {
  Card,
  CardHeader,
  CardBody,
  CardFooter
} from "@chakra-ui/card";
import { useTranslation } from "@/i18n/client";
import React, { use } from "react";
import { Client } from "@/util/types";

const OAuthClientCard = (props: { lng: string, client: Client }) => {
  const { lng, client } = props;
  const { t } = useTranslation(lng, "admin");

  return <Card>
    <CardHeader>
      <Box fontWeight="bold" fontSize="xl">
        {client.name?.[lng] || client.name?.["en"] || t("oauth-no-name")}
      </Box>
    </CardHeader>
    <CardBody>
      <Box color="gray.600" mb={4}>
        {client.description?.[lng] || client.description?.["en"] || t("oauth-no-description")}
      </Box>
      <Box>
        <Box as="span" fontWeight="semibold">{t("oauth-redirect-uri")}:</Box>
        <Box as="span" color="blue.500">{client.redirectUri}</Box>
      </Box>
    </CardBody>
    <CardFooter>
    </CardFooter>
  </Card>
}

export default OAuthClientCard;