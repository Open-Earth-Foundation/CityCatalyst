import {
  DialogBackdrop,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
} from "@/components/ui/dialog";
import React, { FC, useState } from "react";
import { TFunction } from "i18next";
import {
  Box,
  Checkbox,
  Flex,
  HStack,
  Icon,
  Input,
  NativeSelect,
  Tabs,
  Text,
} from "@chakra-ui/react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field } from "@/components/ui/field";
import { MdWarning } from "react-icons/md";
import { api } from "@/services/api";
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";
import { OrganizationRole } from "@/util/types";
import { trackEvent } from "@/lib/analytics";

type ApiErrorData = {
  errorKey?: string;
  message?: string;
  emails?: string[];
};

type ApiMutationError = {
  data?: {
    error?: string | { data?: ApiErrorData };
  };
};

interface CreateOrganizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  t: TFunction;
  onOpenChange: (val: boolean) => void;
}

const schema = z.object({
  email: z.string().email("invalid-email").min(1, "required"),
  name: z.string().min(3, "required"),
  projectName: z.string().min(3, "required"),
  description: z.string().min(3, "required"),
  cityCountLimit: z.coerce.number().min(1, "required"),
  includeDemoInventory: z.boolean().optional(),
  demoInventoryTemplateId: z.string().optional(),
});

type Schema = z.infer<typeof schema>;

const DEFAULT_DEMO_INVENTORY_TEMPLATE_ID = "porto-alegre-2022";

const CreateOrganizationModal: FC<CreateOrganizationModalProps> = ({
  isOpen,
  onClose,
  t,
  onOpenChange,
}) => {
  const [step, setStep] = useState(1);

  const {
    register,
    reset,
    watch,
    trigger,
    getValues,
    control,
    formState: { errors },
  } = useForm<Schema>({
    mode: "all",
    resolver: zodResolver(schema),
    defaultValues: {
      includeDemoInventory: false,
      demoInventoryTemplateId: DEFAULT_DEMO_INVENTORY_TEMPLATE_ID,
    },
  });

  const orgName = watch("name");
  const includeDemoInventory = watch("includeDemoInventory");

  const { showErrorToast } = UseErrorToast({
    title: t("error-message"),
  });
  const { showSuccessToast } = UseSuccessToast({
    title: t("organization-added"),
    description: t("invite-link-copied-to-clipboard"),
    duration: 1200,
  });

  const [createOrganization, { isLoading }] =
    api.useCreateOrganizationMutation();

  const [createProject, { isLoading: isProjectLoading }] =
    api.useCreateProjectMutation();

  const [createOrganizationInvite, { isLoading: isInviteLoading }] =
    api.useCreateOrganizationInviteMutation();

  const [provisionDemoInventory, { isLoading: isDemoInventoryLoading }] =
    api.useProvisionDemoInventoryMutation();

  const isSubmitting =
    isLoading || isProjectLoading || isInviteLoading || isDemoInventoryLoading;

  const handleNext = async () => {
    const valid = await trigger(["name", "email"]);
    if (valid) setStep(2);
  };

  const handlePrimaryAction = async () => {
    console.log("[CreateOrgModal] primary action click", {
      step,
      values: getValues(),
    });
    if (step === 1) {
      await handleNext();
      return;
    }

    const valid = await trigger([
      "projectName",
      "description",
      "cityCountLimit",
      "includeDemoInventory",
      "demoInventoryTemplateId",
    ]);

    if (!valid) {
      console.warn("[CreateOrgModal] validation failed", errors);
      const fieldErrors = Object.entries(errors)
        .map(([field, fieldError]) => `${field}: ${fieldError?.message}`)
        .join("; ");
      showErrorToast({
        title: t("error-message"),
        description: fieldErrors || t("unknown-error"),
      });
      return;
    }

    try {
      await handleFormSubmit(getValues());
    } catch (err) {
      console.error("[CreateOrgModal] submit threw", err);
      showErrorToast({
        title: t("error-message"),
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const closeFunction = () => {
    setStep(1);
    onClose();
    reset();
  };

  const isApiMutationError = (error: unknown): error is ApiMutationError =>
    typeof error === "object" && error !== null && "data" in error;

  const handleCustomError = (error: unknown, fallbackTitle: string) => {
    const errorBody = isApiMutationError(error) ? error.data?.error : undefined;
    const errorData =
      typeof errorBody === "object" && errorBody !== null
        ? errorBody?.data
        : undefined;
    const errorKey =
      errorData?.errorKey ||
      (typeof errorBody === "string" ? errorBody : "unknown-error");
    const message = errorData?.message || errorKey;

    // Handle specific error data based on error type
    let description = t(message);
    if (errorData && "emails" in errorData && errorData.emails) {
      const safeEmails = errorData.emails.map((email: string) =>
        email.replace(/[<>"'&]/g, ""),
      );
      description += " " + safeEmails.join(", ");
    }

    showErrorToast({
      title: t(fallbackTitle),
      description,
    });
  };

  const handleFormSubmit = async (data: Schema) => {
    const {
      name,
      email,
      projectName,
      description,
      cityCountLimit,
      includeDemoInventory,
      demoInventoryTemplateId,
    } = data;

    const response = await createOrganization({
      name,
      contactEmail: email,
    });

    if (response.data) {
      const orgId = response.data.organizationId;
      const projectResponse = await createProject({
        name: projectName,
        description,
        cityCountLimit,
        organizationId: orgId,
      });
      if (projectResponse.data && includeDemoInventory) {
        const demoInventoryResponse = await provisionDemoInventory({
          projectId: projectResponse.data.projectId,
          templateId:
            demoInventoryTemplateId || DEFAULT_DEMO_INVENTORY_TEMPLATE_ID,
        });

        if (demoInventoryResponse.error) {
          handleCustomError(
            demoInventoryResponse.error,
            "demo-inventory-error",
          );
          return;
        }
      }

      const inviteResponse = await createOrganizationInvite({
        organizationId: orgId,
        role: OrganizationRole.ORG_ADMIN,
        inviteeEmails: [response.data.contactEmail],
      });
      if (projectResponse.data && inviteResponse.data) {
        // Track admin invitation
        trackEvent("admin_invited", {
          num_invitees: 1,
          organization_id: response.data.organizationId,
          role: "admin",
          invited_emails: [response.data.contactEmail],
        });
        // Copy invite URLs to clipboard
        if (inviteResponse.data.inviteUrls) {
          const inviteUrls = Object.values(inviteResponse.data.inviteUrls);
          if (inviteUrls.length > 0) {
            const urlsText = inviteUrls.join("\n");
            navigator.clipboard.writeText(urlsText).catch(() => {
              // Fallback if clipboard API fails
              console.warn("Failed to copy to clipboard");
            });
          }
        }
        showSuccessToast();
        closeFunction();
      } else if (inviteResponse.error) {
        handleCustomError(inviteResponse.error, "error-invite");
      }
    } else if (response.error) {
      handleCustomError(response.error, "error-organization");
    } else {
      showErrorToast();
    }
  };

  return (
    <DialogRoot
      preventScroll
      open={isOpen}
      onOpenChange={(e: { open: boolean }) => onOpenChange(e.open)}
      onExitComplete={closeFunction}
    >
      <DialogBackdrop />
      <DialogContent minH="300px" minW="600px" marginTop="2%">
        <DialogHeader
          display="flex"
          justifyContent="start"
          fontWeight="semibold"
          fontSize="headline.sm"
          fontFamily="heading"
          lineHeight="32"
          color="base.dark"
          padding="24px"
          borderBottomWidth="2px"
          borderStyle="solid"
          borderColor="background.neutral"
        >
          {t("add-organization")}
        </DialogHeader>
        <DialogCloseTrigger mt={"4"} />
        <Box paddingY={6} paddingX={10}>
          <Tabs.Root
            variant="line"
            lazyMount
            defaultValue="organization-data"
            value={["organization-data", "project"][step - 1]}
          >
            <Tabs.List borderStyle="hidden">
              {["organization-data", "project"].map((tab, index) => (
                <Tabs.Trigger
                  key={index}
                  value={tab}
                  disabled={!(index <= step - 1)}
                  onClick={() => setStep(index + 1)}
                >
                  <Text
                    fontFamily="heading"
                    fontSize="title.md"
                    fontWeight="medium"
                  >
                    {t(tab)}
                  </Text>
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <Tabs.Content pt="6" pb={10} value="organization-data">
              <Text
                fontFamily="heading"
                fontSize="title.lg"
                fontWeight="medium"
              >
                {t("organization-data")}
              </Text>
              <Text mt={6} color="content.tertiary" fontSize="body.lg">
                {t("add-organization-caption")}
              </Text>

              <HStack
                mt="24px"
                flexDirection="column"
                alignItems="start"
                gap="24px"
              >
                <Field
                  labelClassName="font-semibold"
                  label={t("organization-name")}
                >
                  <Input
                    borderColor={
                      errors?.name ? "sentiment.negativeDefault" : ""
                    }
                    {...register("name")}
                  />
                  {errors.name && (
                    <Box display="flex" gap="6px" alignItems="center" mt="6px">
                      <Icon as={MdWarning} color="sentiment.negativeDefault" />
                      <Text color="error" fontSize="body.md">
                        {t(errors.name.message as string)}
                      </Text>
                    </Box>
                  )}
                </Field>
                <Field labelClassName="font-semibold" label={t("email")}>
                  <Input
                    borderColor={
                      errors?.email ? "sentiment.negativeDefault" : ""
                    }
                    {...register("email")}
                  />
                  {errors.email && (
                    <Box display="flex" gap="6px" alignItems="center" mt="6px">
                      <Icon as={MdWarning} color="sentiment.negativeDefault" />
                      <Text color="error" fontSize="body.sm">
                        {t(errors.email.message as string)}
                      </Text>
                    </Box>
                  )}
                </Field>
              </HStack>
            </Tabs.Content>
            <Tabs.Content value="project">
              <Text
                fontFamily="heading"
                fontSize="title.lg"
                fontWeight="medium"
              >
                {t("project")}
              </Text>
              <Text mt={6} color="content.tertiary" fontSize="body.lg">
                {t("first-project-subheading", {
                  org_name: orgName,
                })}
              </Text>
              <HStack
                mt="24px"
                flexDirection="column"
                alignItems="start"
                gap="24px"
              >
                <Field labelClassName="font-semibold" label={t("project-name")}>
                  <Input
                    borderColor={
                      errors?.projectName ? "sentiment.negativeDefault" : ""
                    }
                    {...register("projectName")}
                  />
                  {errors?.projectName && (
                    <Box display="flex" gap="6px" alignItems="center" mt="6px">
                      <Icon as={MdWarning} color="sentiment.negativeDefault" />
                      <Text color="error" fontSize="body.sm">
                        {t(errors?.projectName.message as string)}
                      </Text>
                    </Box>
                  )}
                </Field>
                <Field labelClassName="font-semibold" label={t("description")}>
                  <Input
                    borderColor={
                      errors?.description ? "sentiment.negativeDefault" : ""
                    }
                    {...register("description")}
                  />
                  {errors?.description && (
                    <Box display="flex" gap="6px" alignItems="center" mt="6px">
                      <Icon as={MdWarning} color="sentiment.negativeDefault" />
                      <Text color="error" fontSize="body.sm">
                        {t(errors?.description.message as string)}
                      </Text>
                    </Box>
                  )}
                </Field>
                <Field labelClassName="font-semibold" label={t("city-limit")}>
                  <Input
                    type="number"
                    min={1}
                    max={99999}
                    placeholder="00"
                    borderColor={
                      errors?.cityCountLimit ? "sentiment.negativeDefault" : ""
                    }
                    {...register("cityCountLimit", { valueAsNumber: true })}
                  />
                  {errors.cityCountLimit && (
                    <Box display="flex" gap="6px" alignItems="center" mt="6px">
                      <Icon as={MdWarning} color="sentiment.negativeDefault" />
                      <Text color="error" fontSize="body.sm">
                        {t(errors.cityCountLimit?.message as string)}
                      </Text>
                    </Box>
                  )}
                </Field>
                <Controller
                  control={control}
                  name="includeDemoInventory"
                  render={({ field }) => (
                    <Checkbox.Root
                      checked={field.value ?? false}
                      onCheckedChange={(details) =>
                        field.onChange(details.checked === true)
                      }
                    >
                      <Checkbox.HiddenInput
                        name={field.name}
                        onBlur={field.onBlur}
                        ref={field.ref}
                      />
                      <Checkbox.Control />
                      <Checkbox.Label
                        fontSize="body.lg"
                        color="content.secondary"
                        fontWeight="semibold"
                      >
                        {t("include-demo-inventory")}
                      </Checkbox.Label>
                    </Checkbox.Root>
                  )}
                />
                {includeDemoInventory && (
                  <Field
                    labelClassName="font-semibold"
                    label={t("demo-inventory-template")}
                  >
                    <NativeSelect.Root>
                      <NativeSelect.Field
                        h="56px"
                        boxShadow="1dp"
                        {...register("demoInventoryTemplateId")}
                      >
                        <option value={DEFAULT_DEMO_INVENTORY_TEMPLATE_ID}>
                          {t("porto-alegre-2022-demo-inventory")}
                        </option>
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root>
                    <Text mt={2} color="content.tertiary" fontSize="body.sm">
                      {t("demo-inventory-template-help")}
                    </Text>
                  </Field>
                )}
              </HStack>
            </Tabs.Content>
          </Tabs.Root>
        </Box>
        <DialogFooter
          paddingX={6}
          paddingY={6}
          borderTop="2px"
          borderColor="background.neutral"
          borderStyle="solid"
        >
          <Flex gap={6}>
            <Button
              type="button"
              onClick={step === 2 ? () => setStep(1) : closeFunction}
              w="200px"
              h="64px"
              variant="outline"
            >
              {step === 1 ? t("cancel") : t("back")}
            </Button>
            <Button
              type="button"
              onClick={handlePrimaryAction}
              w="200px"
              h="64px"
              loading={isSubmitting}
            >
              {
                {
                  1: t("next"),
                  2: t("add-org-short"),
                }[step]
              }
            </Button>
          </Flex>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};

export default CreateOrganizationModal;
