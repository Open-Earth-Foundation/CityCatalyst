"use client";

import { Box, IconButton, Icon } from "@chakra-ui/react";
import { Card, CardHeader, CardBody, CardFooter } from "@chakra-ui/card";
import { MdDelete } from "react-icons/md";
import { useTranslation } from "@/i18n/client";
import React, { use } from "react";
import { Client } from "@/util/types";
import { TitleMedium } from "@/components/Texts/Title";
import { ButtonMedium } from "@/components/Texts/Button";

const OAuthClientCard = (props: { lng: string; client: Client }) => {
  const { lng, client } = props;
  const { t } = useTranslation(lng, "admin");

  const handleDelete = () => {
    alert("Deleting client");
  };

  return (
    <Card>
      <CardHeader>
        <TitleMedium>
          {client.name?.[lng] || client.name?.["en"] || t("oauth-no-name")}
        </TitleMedium>
      </CardHeader>
      <CardBody>
        <Box color="gray.600" mb={4}>
          {client.description?.[lng] ||
            client.description?.["en"] ||
            t("oauth-no-description")}
        </Box>
        <Box>
          <Box as="span" fontWeight="semibold">
            {t("oauth-redirect-uri")}:{" "}
          </Box>
          <Box as="span" color="blue.500">
            {client.redirectUri}
          </Box>
        </Box>
      </CardBody>
      <CardFooter>
        <IconButton aria-label="Delete" onClick={handleDelete}>
          <Icon as={MdDelete} size="lg" />
        </IconButton>
      </CardFooter>
    </Card>
  );
};

export default OAuthClientCard;
