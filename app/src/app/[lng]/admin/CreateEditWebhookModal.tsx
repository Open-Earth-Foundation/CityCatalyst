"use client";

import React, { FC, useEffect } from "react";
import { TFunction } from "i18next";
import { Box, Checkbox, HStack, Input, Text, VStack } from "@chakra-ui/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createWebhookSubscriptionRequest,
  type CreateWebhookSubscriptionRequest,
} from "@/util/validation";
import {
  DialogBackdrop,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { api } from "@/services/api";
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";
import {
  WEBHOOK_EMITTED_EVENT_TYPES,
  isEmittedWebhookEventType,
} from "@/backend/webhooks/events";
import type { WebhookSubscriptionResponse } from "@/util/types";

const DEFAULT_EVENTS = [WEBHOOK_EMITTED_EVENT_TYPES[0]];

type Schema = CreateWebhookSubscriptionRequest;

interface CreateEditWebhookModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenChange: (val: boolean) => void;
  organizationId: string;
  webhook: WebhookSubscriptionResponse | null;
  t: TFunction;
  onSecretIssued: (secret: string) => void;
}

const CreateEditWebhookModal: FC<CreateEditWebhookModalProps> = ({
  isOpen,
  onClose,
  onOpenChange,
  organizationId,
  webhook,
  t,
  onSecretIssued,
}) => {
  const isEdit = Boolean(webhook);
  const [createWebhook, { isLoading: isCreating }] =
    api.useCreateOrganizationWebhookMutation();
  const [updateWebhook, { isLoading: isUpdating }] =
    api.useUpdateOrganizationWebhookMutation();

  const { showErrorToast } = UseErrorToast({
    title: isEdit ? t("webhook-update-error") : t("webhook-create-error"),
  });
  const { showSuccessToast } = UseSuccessToast({
    title: isEdit ? t("webhook-updated") : t("webhook-created"),
    duration: 1200,
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<Schema>({
    mode: "onSubmit",
    resolver: zodResolver(createWebhookSubscriptionRequest),
    defaultValues: {
      name: "",
      url: "",
      events: DEFAULT_EVENTS,
    },
  });

  useEffect(() => {
    const selected = (webhook?.events ?? DEFAULT_EVENTS).filter(
      isEmittedWebhookEventType,
    );
    reset({
      name: webhook?.name ?? "",
      url: webhook?.url ?? "",
      events: selected.length > 0 ? selected : DEFAULT_EVENTS,
    });
  }, [webhook, isOpen, reset]);

  const selectedEvents = watch("events") ?? [];

  const toggleEvent = (
    eventType: (typeof WEBHOOK_EMITTED_EVENT_TYPES)[number],
    checked: boolean,
  ) => {
    const current = getValues("events") ?? [];
    const next = checked
      ? Array.from(new Set([...current, eventType]))
      : current.filter((event) => event !== eventType);
    setValue("events", next, { shouldValidate: true, shouldDirty: true });
  };

  const handleFormSubmit = async (data: Schema) => {
    if (isEdit && webhook) {
      const response = await updateWebhook({
        organizationId,
        webhookId: webhook.id,
        body: data,
      });
      if ("data" in response) {
        showSuccessToast();
        onClose();
        reset();
      } else {
        showErrorToast();
      }
      return;
    }

    const response = await createWebhook({
      organizationId,
      body: data,
    });
    if ("data" in response && response.data?.secret) {
      showSuccessToast();
      onClose();
      reset();
      onSecretIssued(response.data.secret);
    } else {
      showErrorToast();
    }
  };

  return (
    <DialogRoot
      preventScroll
      open={isOpen}
      onOpenChange={(e) => {
        onOpenChange(e.open);
        if (!e.open) {
          onClose();
          reset();
        }
      }}
    >
      <DialogBackdrop />
      <DialogContent minW="600px" marginTop="2%">
        <DialogHeader
          display="flex"
          justifyContent="center"
          fontWeight="semibold"
          fontSize="headline.sm"
          fontFamily="heading"
          color="content.primary"
          padding="24px"
          borderBottomWidth="2px"
          borderStyle="solid"
          borderColor="background.neutral"
        >
          {isEdit ? t("edit-webhook") : t("create-webhook")}
        </DialogHeader>
        <DialogCloseTrigger mt="2" color="interactive.control" mr="2" />
        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <VStack align="stretch" gap={5} padding="24px">
            <Field
              label={t("webhook-name")}
              invalid={Boolean(errors.name)}
              errorText={errors.name ? t("required") : undefined}
            >
              <Input h="48px" {...register("name")} />
            </Field>
            <Field
              label={t("webhook-url")}
              invalid={Boolean(errors.url)}
              errorText={
                errors.url
                  ? t(
                      errors.url.message === "webhook-url-must-be-https"
                        ? "webhook-url-https"
                        : errors.url.message || "webhook-url-https",
                    )
                  : undefined
              }
              helperText={t("webhook-url-https")}
            >
              <Input
                h="48px"
                placeholder={t("webhook-url-placeholder")}
                {...register("url")}
              />
            </Field>
            {/* Keep mapped checkboxes out of Field — FieldRoot only wires the first checkbox. */}
            <Box>
              <Text
                fontSize="body.md"
                color="content.tertiary"
                fontWeight="medium"
                mb={2}
              >
                {t("webhook-events")}
              </Text>
              <VStack align="stretch" gap={2}>
                {WEBHOOK_EMITTED_EVENT_TYPES.map((eventType) => (
                  <Checkbox.Root
                    key={eventType}
                    value={eventType}
                    checked={selectedEvents.includes(eventType)}
                    onCheckedChange={(details) =>
                      toggleEvent(eventType, details.checked === true)
                    }
                  >
                    <Checkbox.HiddenInput />
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    <Checkbox.Label>
                      {t(`event-${eventType.replace(".", "-")}`)}
                      <Text
                        as="span"
                        color="content.tertiary"
                        ml={2}
                        fontSize="body.sm"
                      >
                        {eventType}
                      </Text>
                    </Checkbox.Label>
                  </Checkbox.Root>
                ))}
              </VStack>
              {errors.events ? (
                <Text
                  mt={2}
                  fontSize="body.sm"
                  color="sentiment.negativeDefault"
                >
                  {t("webhook-events-required")}
                </Text>
              ) : null}
            </Box>
          </VStack>
          <DialogFooter
            paddingX={6}
            paddingY={6}
            borderTop="2px"
            borderColor="background.neutral"
            borderStyle="solid"
          >
            <HStack w="full" justify="flex-end" gap={3}>
              <Button type="button" variant="ghost" h="48px" onClick={onClose}>
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                h="48px"
                bg="interactive.secondary"
                color="base.light"
                loading={isCreating || isUpdating}
              >
                {isEdit ? t("save-webhook") : t("create-webhook")}
              </Button>
            </HStack>
          </DialogFooter>
        </form>
      </DialogContent>
    </DialogRoot>
  );
};

export default CreateEditWebhookModal;
