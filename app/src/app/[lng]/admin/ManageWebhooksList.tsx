"use client";

import {
  Box,
  Button,
  Heading,
  Icon,
  IconButton,
  NativeSelect,
  Table,
  Text,
} from "@chakra-ui/react";
import { BsPlus } from "react-icons/bs";
import {
  MdDelete,
  MdEdit,
  MdKey,
  MdMoreVert,
  MdPauseCircleOutline,
  MdPlayCircleOutline,
} from "react-icons/md";
import { useTranslation } from "@/i18n/client";
import React, { useState } from "react";
import { api } from "@/services/api";
import DataTable from "@/components/ui/data-table";
import { Tag } from "@/components/ui/tag";
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu";
import ProgressLoader from "@/components/ProgressLoader";
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";
import type { WebhookSubscriptionResponse } from "@/util/types";
import CreateEditWebhookModal from "./CreateEditWebhookModal";
import DeleteWebhookModal from "./DeleteWebhookModal";
import WebhookSecretModal from "./WebhookSecretModal";

const ManageWebhooksList = ({ lng }: { lng: string }) => {
  const { t } = useTranslation(lng, "admin");
  const { data: organizations, isLoading: isOrgsLoading } =
    api.useGetOrganizationsQuery({});
  const [organizationId, setOrganizationId] = useState("");

  const { data: webhooks, isLoading: isWebhooksLoading } =
    api.useGetOrganizationWebhooksQuery(organizationId, {
      skip: !organizationId,
    });
  const [updateWebhook] = api.useUpdateOrganizationWebhookMutation();
  const [rotateSecret] = api.useRotateOrganizationWebhookSecretMutation();

  const { showErrorToast } = UseErrorToast({
    title: t("error-message"),
  });
  const { showSuccessToast } = UseSuccessToast({
    title: t("webhook-updated"),
    duration: 1200,
  });

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] =
    useState<WebhookSubscriptionResponse | null>(null);
  const [deletingWebhook, setDeletingWebhook] =
    useState<WebhookSubscriptionResponse | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [issuedSecret, setIssuedSecret] = useState<string | null>(null);

  const handleToggleEnabled = async (webhook: WebhookSubscriptionResponse) => {
    const response = await updateWebhook({
      organizationId,
      webhookId: webhook.id,
      body: { enabled: !webhook.enabled },
    });
    if ("data" in response) {
      showSuccessToast();
    } else {
      showErrorToast({ title: t("webhook-update-error") });
    }
  };

  const handleRotateSecret = async (webhook: WebhookSubscriptionResponse) => {
    const response = await rotateSecret({
      organizationId,
      webhookId: webhook.id,
    });
    if ("data" in response && response.data?.secret) {
      showSuccessToast({ title: t("webhook-secret-rotated") });
      setIssuedSecret(response.data.secret);
    } else {
      showErrorToast({ title: t("webhook-rotate-error") });
    }
  };

  const renderStatus = (webhook: WebhookSubscriptionResponse) => {
    if (webhook.disabledAt && !webhook.enabled) {
      return (
        <Tag size="lg" colorPalette="yellow">
          {t("webhook-auto-disabled")}
        </Tag>
      );
    }
    if (webhook.enabled) {
      return (
        <Tag size="lg" colorPalette="green">
          {t("webhook-enabled")}
        </Tag>
      );
    }
    return (
      <Tag size="lg" colorPalette="gray">
        {t("webhook-disabled")}
      </Tag>
    );
  };

  return (
    <>
      <Box display="flex" alignItems="center" justifyContent="space-between">
        <Box>
          <Heading
            fontSize="headline.sm"
            mb={2}
            fontWeight="semibold"
            lineHeight="32px"
            fontStyle="normal"
            textTransform="capitalize"
            color="content.secondary"
          >
            {t("manage-webhooks-heading")}
          </Heading>
          <Text color="content.tertiary" fontSize="body.lg">
            {t("manage-webhooks-caption")}
          </Text>
        </Box>
        <Button
          onClick={() => {
            setEditingWebhook(null);
            setIsFormOpen(true);
          }}
          variant="ghost"
          h="48px"
          bg="interactive.secondary"
          color="base.light"
          mt="auto"
          disabled={!organizationId}
        >
          <Icon as={BsPlus} h={8} w={8} />
          {t("add-webhook")}
        </Button>
      </Box>

      <Box mt={6} maxW="420px">
        <Text fontSize="body.md" color="content.tertiary" mb={2}>
          {t("organization")}
        </Text>
        {isOrgsLoading ? (
          <ProgressLoader />
        ) : (
          <NativeSelect.Root>
            <NativeSelect.Field
              h="56px"
              boxShadow="1dp"
              value={organizationId}
              onChange={(event) => setOrganizationId(event.target.value)}
            >
              <option value="">{t("select-organization")}</option>
              {organizations?.map((org) => (
                <option
                  value={org.organizationId}
                  key={org.organizationId}
                >
                  {org.name}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        )}
      </Box>

      <Box mt={8}>
        {!organizationId && (
          <Text color="content.tertiary" fontSize="body.lg">
            {t("select-organization")}
          </Text>
        )}
        {organizationId && isWebhooksLoading && <ProgressLoader />}
        {organizationId &&
          !isWebhooksLoading &&
          (!webhooks || webhooks.length === 0) && (
            <Text color="content.tertiary" fontSize="body.lg">
              {t("no-webhooks")}
            </Text>
          )}
        {organizationId && !isWebhooksLoading && webhooks && webhooks.length > 0 && (
          <DataTable
            searchable={true}
            pagination={true}
            data={webhooks}
            title={t("manage-webhooks")}
            columns={[
              { header: t("webhook-name"), accessor: "name" },
              { header: t("webhook-url"), accessor: "url" },
              { header: t("webhook-events"), accessor: "events" },
              { header: t("webhook-status"), accessor: "enabled" },
              { header: t("webhook-secret-prefix"), accessor: "secretPrefix" },
              { header: "", accessor: null },
            ]}
            renderRow={(item) => (
              <Table.Row key={item.id}>
                <Table.Cell>{item.name}</Table.Cell>
                <Table.Cell>
                  <Text maxW="240px" truncate title={item.url}>
                    {item.url}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <Box display="flex" flexWrap="wrap" gap={1}>
                    {item.events.map((event) => (
                      <Tag key={event} size="sm" colorPalette="blue">
                        {event}
                      </Tag>
                    ))}
                  </Box>
                </Table.Cell>
                <Table.Cell>{renderStatus(item)}</Table.Cell>
                <Table.Cell>
                  <Text fontFamily="mono">{item.secretPrefix}…</Text>
                </Table.Cell>
                <Table.Cell>
                  <MenuRoot>
                    <MenuTrigger asChild>
                      <IconButton
                        aria-label="more-icon"
                        variant="ghost"
                        color="content.tertiary"
                      >
                        <Icon as={MdMoreVert} size="lg" />
                      </IconButton>
                    </MenuTrigger>
                    <MenuContent
                      w="auto"
                      borderRadius="8px"
                      shadow="2dp"
                      px="0"
                    >
                      <MenuItem
                        value={t("edit-webhook")}
                        valueText={t("edit-webhook")}
                        p="16px"
                        display="flex"
                        alignItems="center"
                        gap="16px"
                        _hover={{ bg: "content.link", cursor: "pointer" }}
                        className="group"
                        onClick={() => {
                          setEditingWebhook(item);
                          setIsFormOpen(true);
                        }}
                      >
                        <Icon
                          _groupHover={{ color: "base.light" }}
                          color="interactive.control"
                          as={MdEdit}
                          h="24px"
                          w="24px"
                        />
                        <Text
                          _groupHover={{ color: "base.light" }}
                          color="content.primary"
                        >
                          {t("edit-webhook")}
                        </Text>
                      </MenuItem>
                      <MenuItem
                        value={
                          item.enabled
                            ? t("webhook-disable")
                            : t("webhook-enable")
                        }
                        valueText={
                          item.enabled
                            ? t("webhook-disable")
                            : t("webhook-enable")
                        }
                        p="16px"
                        display="flex"
                        alignItems="center"
                        gap="16px"
                        _hover={{ bg: "content.link", cursor: "pointer" }}
                        className="group"
                        onClick={() => handleToggleEnabled(item)}
                      >
                        <Icon
                          _groupHover={{ color: "base.light" }}
                          color="interactive.control"
                          as={
                            item.enabled
                              ? MdPauseCircleOutline
                              : MdPlayCircleOutline
                          }
                          h="24px"
                          w="24px"
                        />
                        <Text
                          _groupHover={{ color: "base.light" }}
                          color="content.primary"
                        >
                          {item.enabled
                            ? t("webhook-disable")
                            : t("webhook-enable")}
                        </Text>
                      </MenuItem>
                      <MenuItem
                        value={t("rotate-webhook-secret")}
                        valueText={t("rotate-webhook-secret")}
                        p="16px"
                        display="flex"
                        alignItems="center"
                        gap="16px"
                        _hover={{ bg: "content.link", cursor: "pointer" }}
                        className="group"
                        onClick={() => handleRotateSecret(item)}
                      >
                        <Icon
                          _groupHover={{ color: "base.light" }}
                          color="interactive.control"
                          as={MdKey}
                          h="24px"
                          w="24px"
                        />
                        <Text
                          _groupHover={{ color: "base.light" }}
                          color="content.primary"
                        >
                          {t("rotate-webhook-secret")}
                        </Text>
                      </MenuItem>
                      <MenuItem
                        value={t("delete-webhook")}
                        valueText={t("delete-webhook")}
                        p="16px"
                        display="flex"
                        alignItems="center"
                        gap="16px"
                        _hover={{ bg: "content.link", cursor: "pointer" }}
                        className="group"
                        onClick={() => {
                          setDeletingWebhook(item);
                          setIsDeleteOpen(true);
                        }}
                      >
                        <Icon
                          _groupHover={{ color: "base.light" }}
                          color="interactive.control"
                          as={MdDelete}
                          h="24px"
                          w="24px"
                        />
                        <Text
                          _groupHover={{ color: "base.light" }}
                          color="content.primary"
                        >
                          {t("delete-webhook")}
                        </Text>
                      </MenuItem>
                    </MenuContent>
                  </MenuRoot>
                </Table.Cell>
              </Table.Row>
            )}
          />
        )}
      </Box>

      <CreateEditWebhookModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingWebhook(null);
        }}
        onOpenChange={setIsFormOpen}
        organizationId={organizationId}
        webhook={editingWebhook}
        t={t}
        onSecretIssued={setIssuedSecret}
      />
      <DeleteWebhookModal
        isOpen={isDeleteOpen}
        onClose={() => {
          setIsDeleteOpen(false);
          setDeletingWebhook(null);
        }}
        onOpenChange={setIsDeleteOpen}
        organizationId={organizationId}
        webhook={deletingWebhook}
        t={t}
      />
      <WebhookSecretModal
        isOpen={Boolean(issuedSecret)}
        secret={issuedSecret}
        onClose={() => setIssuedSecret(null)}
        t={t}
      />
    </>
  );
};

export default ManageWebhooksList;
