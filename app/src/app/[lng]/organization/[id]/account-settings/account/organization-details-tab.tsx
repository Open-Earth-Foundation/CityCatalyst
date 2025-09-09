import { Box, HStack, Text, Input, Icon } from "@chakra-ui/react";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { MdWarning } from "react-icons/md";
import { useParams } from "next/navigation";
import { useTranslation } from "@/i18n/client";
import { OrganizationResponse, LANGUAGES } from "@/util/types";
import {
  useGetUserAccessStatusQuery,
  useUpdateOrganizationMutation,
} from "@/services/api";
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";
import { logger } from "@/services/logger";
import { LanguageSelector } from "@/app/[lng]/auth/signup/LanguageSelector";
import PlanDetailsBox from "@/components/PlanDetailsBox";

const OrganizationDetailsTab = ({
  organization,
}: {
  organization: OrganizationResponse | undefined;
}) => {
  const { lng } = useParams();
  const { t } = useTranslation(lng as string, "admin");

  const schema = z.object({
    email: z.string().email("invalid-email").min(1, "required"),
    name: z.string().min(3, "required"),
    preferredLanguage: z.string().min(1, "required"),
  });

  const { showErrorToast } = UseErrorToast({
    title: t("error-message"),
  });
  const { showSuccessToast } = UseSuccessToast({
    title: t("organization-updated"),
    duration: 1200,
  });

  type Schema = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<Schema>({
    mode: "all",
    defaultValues: {
      email: organization?.contactEmail,
      name: organization?.name,
      preferredLanguage: organization?.preferredLanguage,
    },
    resolver: zodResolver(schema),
  });

  const [updateOrganization, { isLoading }] = useUpdateOrganizationMutation();
  const { data: userAccessStatus } = useGetUserAccessStatusQuery({});
  const handleFormSubmit = async (data: Schema) => {
    const { name, email, preferredLanguage } = data;

    // [ON-3932] TODO prevent users from editing the default organization
    const response = await updateOrganization({
      id: organization?.organizationId as string,
      name,
      contactEmail: email,
    });

    if (response.error) {
      logger.error(response.error);
      showErrorToast();
      return;
    }

    showSuccessToast();
  };

  return (
    <Box>
      <Box backgroundColor="white" p={6}>
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
          alignItems="flex-start"
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
          <Field disabled labelClassName="font-semibold" label={t("email")}>
            <Input
              disabled
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
        <Box display="flex" justifyContent="flex-end">
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
        <Field
          label={t("preferred-language")}
          invalid={!!errors.preferredLanguage}
          errorText={
            <Box display="flex" gap="6px">
              <Icon as={MdWarning} />
              <Text
                fontSize="body.md"
                lineHeight="20px"
                letterSpacing="wide"
                color="content.tertiary"
              >
                {errors.preferredLanguage?.message}
              </Text>
            </Box>
          }
        >
          <LanguageSelector
            register={register}
            error={errors.preferredLanguage}
            t={t}
            defaultValue={
              (organization?.preferredLanguage as LANGUAGES) || LANGUAGES.en
            }
          />
        </Field>
      </Box>
      {userAccessStatus?.isOrgOwner && (
        <PlanDetailsBox organization={organization} />
      )}
    </Box>
  );
};

export default OrganizationDetailsTab;
