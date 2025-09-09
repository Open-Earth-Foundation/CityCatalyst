import { Box, Card, Text, Spinner, IconButton, Icon } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { useRouter } from "next/navigation";
import React from "react";
import { IconType } from "react-icons";
import { BsPlus } from "react-icons/bs";
import { Authz } from "@/util/types";
import { api } from "@/services/api";
import { toaster } from "@/components/ui/toaster";
import { TitleMedium } from "@/components/Texts/Title";
import { MdDelete } from "react-icons/md";
import { useTranslation } from "@/i18n/client";

interface AppCardProps {
  lng: string;
  app: Authz;
}

const LocalizedTime = ({ date }: { date: Date }) => {
  const formatted = new Intl.DateTimeFormat(navigator.language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);

  return <Text>{formatted}</Text>;
};

export function AppCard({ lng, app }: AppCardProps) {
  const { t } = useTranslation(lng, "settings");
  const [revokeAuthz, { isLoading }] = api.useRevokeAuthzMutation();

  const handleRevoke = async () => {
    if (window.confirm(t("my-apps-revoke-confirm"))) {
      try {
        await revokeAuthz(app.clientId);
        toaster.success({
          title: t("success"),
          description: t("my-apps-revoke-success"),
          duration: 5000,
        });
      } catch (error) {
        toaster.error({
          title: t("error"),
          description: t("my-apps-revoke-error"),
        });
      }
    }
  };

  const client = app.client;

  return (
    <Card.Root>
      <Card.Header>
        <TitleMedium>
          {client.name?.[lng] || client.name?.["en"] || t("my-apps-no-name")}
        </TitleMedium>
      </Card.Header>
      <Card.Body>
        {isLoading ? (
          <Spinner />
        ) : (
          <Box>
            <Box color="gray.600" mb={4}>
              {client.description?.[lng] ||
                client.description?.["en"] ||
                t("my-apps-no-description")}
            </Box>
            <Box>
              <Box as="span" fontWeight="semibold">
                {t("my-apps-authorized-on")}:{" "}
              </Box>
              <Box as="span" color="blue.500">
                <LocalizedTime date={new Date(app.created)} />
              </Box>
            </Box>
            <Box>
              <Box as="span" fontWeight="semibold">
                {t("my-apps-last-used")}:{" "}
              </Box>
              <Box as="span" color="blue.500">
                {app.lastUsed ? (
                  <LocalizedTime date={new Date(app.lastUsed)} />
                ) : (
                  <Text>{t("my-apps-never")}</Text>
                )}
              </Box>
            </Box>
          </Box>
        )}
      </Card.Body>
      <Card.Footer>
        <IconButton aria-label="Revoke" onClick={handleRevoke}>
          <Icon as={MdDelete} size="lg" />
        </IconButton>
      </Card.Footer>
    </Card.Root>
  );
}
