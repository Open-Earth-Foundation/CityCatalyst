import {
  DialogBackdrop,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
} from "@/components/ui/dialog";
import React, { FC, useEffect, useState } from "react";
import { TFunction } from "i18next";
import { Box, Flex, HStack, Icon, Input, Text } from "@chakra-ui/react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field } from "@/components/ui/field";
import FormattedNumberInput from "@/components/formatted-number-input";
import { MdWarning } from "react-icons/md";
import { api } from "@/services/api";
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";

interface CreateEditProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  t: TFunction;
  onOpenChange: (val: boolean) => void;
  organizationId: string;
  projectData?: {
    projectId: string;
    projectName: string;
    description: string;
    cityCountLimit: number;
  } | null;
}

const schema = z.object({
  projectName: z.string().min(3, "required"),
  description: z.string().min(3, "required"),
  cityCountLimit: z.number().min(1, "required"),
});

type Schema = z.infer<typeof schema>;

const CreateEditProjectModal: FC<CreateEditProjectModalProps> = ({
  isOpen,
  onClose,
  t,
  onOpenChange,
  projectData,
  organizationId,
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
    formState: { errors, isValid, isDirty },
  } = useForm<Schema>({
    mode: "all",
    resolver: zodResolver(schema),
  });

  const { showErrorToast } = UseErrorToast({
    title: t("error-message"),
  });
  const { showSuccessToast } = UseSuccessToast({
    title: projectData ? t("project-updated") : t("project-created"),
    duration: 1200,
  });

  useEffect(() => {
    if (projectData) {
      reset({
        projectName: projectData.projectName,
        description: projectData.description,
        cityCountLimit: Number(projectData.cityCountLimit),
      });
    } else {
      reset({
        projectName: "",
        description: "",
        cityCountLimit: 0,
      });
    }
  }, [reset, projectData]);

  const [createProject, { isLoading: isProjectLoading }] =
    api.useCreateProjectMutation();

  const [editProject, { isLoading: isEditLoading }] =
    api.useEditProjectMutation();

  const isSubmitting = isProjectLoading || isEditLoading;

  const closeFunction = () => {
    onClose();
    reset();
  };

  const handleFormSubmit = async (data: Schema) => {
    const { projectName, description, cityCountLimit } = data;

    let response = null;
    if (projectData) {
      response = await editProject({
        projectId: projectData.projectId,
        name: projectName,
        description,
        cityCountLimit,
      });
    } else {
      response = await createProject({
        name: projectName,
        description,
        cityCountLimit,
        organizationId,
      });
    }

    if (response.data) {
      showSuccessToast();
      closeFunction();
    } else {
      showErrorToast();
    }
  };

  return (
    <DialogRoot
      preventScroll
      open={isOpen}
      onOpenChange={(e: any) => {
        onOpenChange(e.open);
        if (!e.open) {
          closeFunction();
        }
      }}
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
          {projectData ? t("edit-project") : t("add-project")}
        </DialogHeader>
        <DialogCloseTrigger mt={"2"} color="interactive.control" mr={"2"} />
        <Box paddingY={6} paddingX={10}>
          <Text fontFamily="heading" fontSize="title.lg" fontWeight="medium">
            {t("project")}
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
              onClick={closeFunction}
              w="200px"
              h="64px"
              variant="outline"
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={handleSubmit(handleFormSubmit)}
              w="200px"
              h="64px"
              loading={isSubmitting}
              disabled={!isDirty}
            >
              {t("save-project")}
            </Button>
          </Flex>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};

export default CreateEditProjectModal;
