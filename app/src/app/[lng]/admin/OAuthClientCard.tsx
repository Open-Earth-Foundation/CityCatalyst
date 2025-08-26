"use client";

import { Card, Box, IconButton, Icon, Spinner } from "@chakra-ui/react";
import { MdDelete } from "react-icons/md";
import { useTranslation } from "@/i18n/client";
import React from "react";
import { Client } from "@/util/types";
import { TitleMedium } from "@/components/Texts/Title";
import { api } from "@/services/api";
import { toaster } from "@/components/ui/toaster";

const OAuthClientCard = (props: { lng: string; client: Client; onDelete?: (client: Client) => void }) => {
  const { lng, client, onDelete } = props;
  const { t } = useTranslation(lng, "admin");
  const [deleteClient, { isLoading }] = api.useDeleteClientMutation();

  const handleDelete = async () => {
    if (window.confirm(t("oauth-clients-delete"))) {
      try {
        await deleteClient(client.clientId);
        if (props.onDelete) {
          props.onDelete(client);
        }
        toaster.success({
          title: t("success"),
          description: t("oauth-clients-success-deleting-client"),
          duration: 5000,
        });
      } catch (error) {
        toaster.error({
          title: t("error"),
          description: t("oauth-clients-error-deleting-client"),
        });
      }
    }
  };

  return (
    <Card.Root>
      <Card.Header>
        <TitleMedium>
          {client.name?.[lng] || client.name?.["en"] || t("oauth-no-name")}
        </TitleMedium>
      </Card.Header>
      <Card.Body>
        {(isLoading)
          ? <Spinner />
          : <Box>
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
              <Box>
                <Box as="span" fontWeight="semibold">
                  {t("oauth-client-id")}:{" "}
                </Box>
                <Box as="span" color="blue.500">
                  {client.clientId}
                </Box>
              </Box>
            </Box>
        }
      </Card.Body>
      <Card.Footer>
        <IconButton aria-label="Delete" onClick={handleDelete}>
          <Icon as={MdDelete} size="lg" />
        </IconButton>
      </Card.Footer>
    </Card.Root>
  );
};

export default OAuthClientCard;
