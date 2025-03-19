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
import { Box, Flex, HStack, Icon, Input, Tabs, Text } from "@chakra-ui/react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field } from "@/components/ui/field";
import FormattedNumberInput from "@/components/formatted-number-input";
import { MdWarning } from "react-icons/md";
import { api } from "@/services/api";
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";
import { OrganizationRole } from "@/util/types";

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
  cityCountLimit: z.number().min(1, "required"),
});

type Schema = z.infer<typeof schema>;

const CreateOrganizationModal: FC<CreateOrganizationModalProps> = ({
  isOpen,
  onClose,
  t,
  onOpenChange,
}) => {
  const [step, setStep] = useState(1);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    clearErrors,
    setFocus,
    setValue,
    control,
    getValues,
    trigger,
    formState: { errors },
  } = useForm<Schema>({
    mode: "all",
    resolver: zodResolver(schema),
  });

  const orgName = watch("name");

  const { showErrorToast } = UseErrorToast({
    title: t("error-message"),
  });
  const { showSuccessToast } = UseSuccessToast({
    title: t("organization-added"),
    duration: 1200,
  });

  const [createOrganization, { isLoading }] =
    api.useCreateOrganizationMutation();

  const [createProject, { isLoading: isProjectLoading }] =
    api.useCreateProjectMutation();

  const [createOrganizationInvite, { isLoading: isInviteLoading }] =
    api.useCreateOrganizationInviteMutation();

  const isSubmitting = isLoading || isProjectLoading || isInviteLoading;

  const handleNext = async () => {
    const valid = await trigger(["name", "email"]);
    if (valid) setStep(2);
  };

  const closeFunction = () => {
    setStep(1);
    onClose();
    reset();
  };

  const handleFormSubmit = async (data: Schema) => {
    const { name, email, projectName, description, cityCountLimit } = data;

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
      const inviteResponse = await createOrganizationInvite({
        organizationId: orgId,
        role: OrganizationRole.ORG_ADMIN,
        inviteeEmail: response.data.contactEmail,
      });
      if (projectResponse.data && inviteResponse.data) {
        showSuccessToast();
        closeFunction();
      } else {
        showErrorToast();
      }
    } else {
      showErrorToast();
    }
  };

  return (
    <DialogRoot
      preventScroll
      open={isOpen}
      onOpenChange={(e: any) => onOpenChange(e.open)}
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
                className="items-start"
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
                className="items-start"
                gap="24px"
              >
                <Field labelClassName="font-semibold" label={t("project-name")}>
                  <Input
                    borderColor={
                      errors?.projectName ? "sentiment.negativeDefault" : ""
                    }
                    {...register("projectName")}
                  />
                  {errors.projectName && (
                    <Box display="flex" gap="6px" alignItems="center" mt="6px">
                      <Icon as={MdWarning} color="sentiment.negativeDefault" />
                      <Text color="error" fontSize="body.sm">
                        {t(errors.projectName.message as string)}
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
                  {errors.description && (
                    <Box display="flex" gap="6px" alignItems="center" mt="6px">
                      <Icon as={MdWarning} color="sentiment.negativeDefault" />
                      <Text color="error" fontSize="body.sm">
                        {t(errors.description.message as string)}
                      </Text>
                    </Box>
                  )}
                </Field>
                <Field labelClassName="font-semibold" label={t("city-limit")}>
                  <FormattedNumberInput
                    placeholder="00"
                    max={99999}
                    setError={setError}
                    clearErrors={clearErrors}
                    min={1}
                    control={control}
                    name={`cityCountLimit`}
                    t={t}
                    w="full"
                  />
                  {errors.description && (
                    <Box display="flex" gap="6px" alignItems="center" mt="6px">
                      <Icon as={MdWarning} color="sentiment.negativeDefault" />
                      <Text color="error" fontSize="body.sm">
                        {t(errors.cityCountLimit?.message as string)}
                      </Text>
                    </Box>
                  )}
                </Field>
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
              onClick={step === 2 ? () => setStep(1) : closeFunction}
              w="200px"
              h="64px"
              variant="outline"
            >
              {step === 1 ? t("cancel") : t("back")}
            </Button>
            <Button
              onClick={step === 2 ? handleSubmit(handleFormSubmit) : handleNext}
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
