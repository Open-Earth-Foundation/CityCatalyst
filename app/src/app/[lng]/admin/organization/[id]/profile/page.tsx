"use client";

import { api, useGetOrganizationQuery } from "@/services/api";
import {
  Box,
  Button,
  Heading,
  HStack,
  Icon,
  Input,
  Text,
} from "@chakra-ui/react";
import {
  ProgressCircleRing,
  ProgressCircleRoot,
} from "@/components/ui/progress-circle";
import React, { useEffect } from "react";
import { useTranslation } from "@/i18n/client";
import { MdReplay, MdWarning } from "react-icons/md";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field } from "@/components/ui/field";
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";
import { OrganizationRole } from "@/util/types";
import { Trans } from "react-i18next";

const AdminOrganizationIdProfilePage = ({
  params: { lng, id },
}: {
  params: { lng: string; id: string };
}) => {
  const { t } = useTranslation(lng, "admin");

  const { data: organization, isLoading: isOrganizationLoading } =
    useGetOrganizationQuery(id);

  const [updateOrganization, { isLoading }] =
    api.useUpdateOrganizationMutation();

  const [createOrganizationInvite, { isLoading: isInviteLoading }] =
    api.useCreateOrganizationInviteMutation();

  const schema = z.object({
    email: z.string().email("invalid-email").min(1, "required"),
    name: z.string().min(3, "required"),
  });

  type Schema = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<Schema>({
    mode: "all",
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (organization) {
      reset({
        email: organization.contactEmail,
        name: organization.name,
      });
    }
  }, [organization]);

  const { showErrorToast } = UseErrorToast({
    title: t("error-message"),
  });
  const { showSuccessToast } = UseSuccessToast({
    title: t("organization-updated"),
    duration: 1200,
  });

  const handleFormSubmit = async (data: Schema) => {
    const { name, email } = data;

    // TODO prevent users from editing the default organization
    const response = await updateOrganization({
      id: organization?.organizationId as string,
      name,
      contactEmail: email,
    });

    if (response.error) {
      showErrorToast();
      return;
    }

    showSuccessToast();
  };

  const resendInvite = async () => {
    const response = await createOrganizationInvite({
      organizationId: organization?.organizationId as string,
      inviteeEmail: organization?.contactEmail as string,
      role: OrganizationRole.ORG_ADMIN,
    });

    if (response.error) {
      showErrorToast();
      return;
    }

    showSuccessToast({
      title: t("invite-sent"),
    });
  };

  if (isOrganizationLoading) {
    return (
      <Box className="w-full py-12 flex items-center justify-center">
        <ProgressCircleRoot value={null}>
          <ProgressCircleRing cap="round" />
        </ProgressCircleRoot>
      </Box>
    );
  }

  return (
    <Box>
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
            {t("org-profile-heading", { name: organization?.name })}
          </Heading>
          <Text color="content.tertiary" fontSize="body.lg">
            {t("org-profile-caption", { name: organization?.name })}
          </Text>
        </Box>
        <Button
          onClick={resendInvite}
          variant="outline"
          h="48px"
          mt="auto"
          loading={isInviteLoading}
        >
          <Icon as={MdReplay} h={8} w={8} />
          {t("resend-invite")}
        </Button>
      </Box>
      <Box backgroundColor="white" p={6} marginTop={12}>
        <Text fontSize="title.md" fontWeight="semibold">
          {t("account-details")}
        </Text>
        <Text fontSize="body.ls" fontWeight="normal" color="content.tertiary">
          {t("account-details-caption")}
        </Text>

        <HStack
          w={"50%"}
          mt="24px"
          flexDirection="column"
          className="items-start"
          gap="24px"
        >
          <Field labelClassName="font-semibold" label={t("organization-name")}>
            <Input
              borderColor={errors?.name ? "sentiment.negativeDefault" : ""}
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
              borderColor={errors?.email ? "sentiment.negativeDefault" : ""}
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
        <Box className="flex justify-end">
          <Button
            onClick={handleSubmit(handleFormSubmit)}
            w="200px"
            h="64px"
            disabled={!isDirty}
            loading={isLoading}
          >
            {t("save-changes")}
          </Button>
        </Box>
      </Box>
      <Box backgroundColor="white" p={6} marginTop={4}>
        <Text
          fontSize="title.md"
          color="content.secondary"
          fontWeight="semibold"
        >
          {t("plan-details")}
        </Text>
        <Text
          fontSize="body.lg"
          fontWeight="normal"
          className="capitalize"
          color="content.tertiary"
        >
          <Trans
            i18nKey="plan-details-caption"
            t={t}
            values={{
              name: organization?.name,
              num_projects: organization?.projects.length ?? 0,
              num_cities: organization?.projects.reduce(
                (acc, proj) => acc + proj.cities.length,
                0,
              ),
              total_cities:
                organization?.projects.reduce(
                  (acc, curr) => acc + BigInt(curr.cityCountLimit),
                  BigInt(0),
                ) ?? 0,
            }}
            components={{
              bold: <strong />,
            }}
          />
        </Text>
      </Box>
    </Box>
  );
};

export default AdminOrganizationIdProfilePage;
