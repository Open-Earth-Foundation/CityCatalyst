"use client";

import React, { FC, useEffect } from "react";
import { TFunction } from "i18next";
import { Box, Flex, HStack, Icon, Image, Input, Link, Textarea } from "@chakra-ui/react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { MdOpenInNew, MdWarning } from "react-icons/md";
import {
  DialogBackdrop,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
} from "@/components/ui/dialog";
import {
  NativeSelectField,
  NativeSelectRoot,
} from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { api } from "@/services/api";
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";
import type { ModuleAttributes } from "@/models/Module";

interface EditModuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenChange: (val: boolean) => void;
  module: ModuleAttributes | null;
  t: TFunction;
}

const STAGE_OPTIONS = [
  { value: "assess-&-analyze", labelKey: "stage-assess-and-analyze" },
  { value: "plan", labelKey: "stage-plan" },
  { value: "implement", labelKey: "stage-implement" },
  { value: "monitor-evaluate-&-report", labelKey: "stage-monitor-evaluate-and-report" },
];

const schema = z.object({
  name: z.string().min(1, "required"),
  description: z.string().optional(),
  tagline: z.string().optional(),
  stage: z.string().min(1, "required"),
  url: z.string().min(1, "required"),
  logo: z.string().optional(),
});

type Schema = z.infer<typeof schema>;

const isValidUrl = (str: string) => {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const EditModuleModal: FC<EditModuleModalProps> = ({
  isOpen,
  onClose,
  onOpenChange,
  module,
  t,
}) => {
  const [updateModule, { isLoading }] = api.useUpdateModuleMutation();

  const { showErrorToast } = UseErrorToast({
    title: t("module-update-error"),
  });
  const { showSuccessToast } = UseSuccessToast({
    title: t("module-updated"),
    duration: 1200,
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<Schema>({
    mode: "all",
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (module) {
      reset({
        name: module.name?.en || "",
        description: module.description?.en || "",
        tagline: module.tagline?.en || "",
        stage: module.stage || "",
        url: module.url || "",
        logo: module.logo || "",
      });
    }
  }, [module, reset]);

  const watchUrl = watch("url");
  const watchLogo = watch("logo");

  const handleFormSubmit = async (data: Schema) => {
    if (!module) return;

    const response = await updateModule({
      id: module.id,
      data: {
        name: data.name,
        description: data.description || "",
        tagline: data.tagline || "",
        stage: data.stage,
        url: data.url,
        logo: data.logo || "",
      },
    });

    if (response.data) {
      showSuccessToast();
      closeFunction();
    } else {
      showErrorToast();
    }
  };

  const closeFunction = () => {
    onClose();
    reset();
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
          {t("edit-module")}
        </DialogHeader>
        <DialogCloseTrigger mt="4" />
        <Box paddingY={6} paddingX={10} maxH="60vh" overflowY="auto">
          <HStack flexDirection="column" alignItems="start" gap="24px">
            <Field labelClassName="font-semibold" label={t("module-name")}>
              <Input
                borderColor={errors?.name ? "sentiment.negativeDefault" : ""}
                {...register("name")}
              />
              {errors.name && (
                <Box display="flex" gap="6px" alignItems="center" mt="6px">
                  <Icon as={MdWarning} color="sentiment.negativeDefault" />
                </Box>
              )}
            </Field>
            <Field labelClassName="font-semibold" label={t("description")}>
              <Textarea
                {...register("description")}
                rows={3}
              />
            </Field>
            <Field labelClassName="font-semibold" label={t("module-tagline")}>
              <Input {...register("tagline")} />
            </Field>
            <Field labelClassName="font-semibold" label={t("module-stage")}>
              <NativeSelectRoot>
                <NativeSelectField
                  {...register("stage")}
                >
                  <option value="" disabled>
                    {t("select-stage")}
                  </option>
                  {STAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t(opt.labelKey)}
                    </option>
                  ))}
                </NativeSelectField>
              </NativeSelectRoot>
              {errors.stage && (
                <Box display="flex" gap="6px" alignItems="center" mt="6px">
                  <Icon as={MdWarning} color="sentiment.negativeDefault" />
                </Box>
              )}
            </Field>
            <Field labelClassName="font-semibold" label={t("module-url")}>
              <Input
                borderColor={errors?.url ? "sentiment.negativeDefault" : ""}
                {...register("url")}
              />
              {errors.url && (
                <Box display="flex" gap="6px" alignItems="center" mt="6px">
                  <Icon as={MdWarning} color="sentiment.negativeDefault" />
                </Box>
              )}
              {watchUrl && isValidUrl(watchUrl) && (
                <Box
                  mt={2}
                  p={3}
                  borderRadius="md"
                  border="1px solid"
                  borderColor="background.neutral"
                  bg="background.neutral"
                  display="flex"
                  alignItems="center"
                  gap={2}
                  maxW="100%"
                  overflow="hidden"
                >
                  <Icon as={MdOpenInNew} color="content.link" />
                  <Link
                    href={watchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    color="content.link"
                    fontSize="sm"
                    truncate
                    _hover={{ textDecoration: "underline" }}
                  >
                    {watchUrl}
                  </Link>
                </Box>
              )}
            </Field>
            <Field labelClassName="font-semibold" label={t("module-logo")}>
              <Input {...register("logo")} />
              {watchLogo && isValidUrl(watchLogo) && (
                <Box
                  mt={2}
                  p={3}
                  borderRadius="md"
                  border="1px solid"
                  borderColor="background.neutral"
                  bg="background.neutral"
                  display="flex"
                  flexDirection="column"
                  alignItems="center"
                  gap={2}
                >
                  <Image
                    key={watchLogo}
                    src={watchLogo}
                    alt="Logo preview"
                    maxH="80px"
                    maxW="100%"
                    objectFit="contain"
                    borderRadius="sm"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <Link
                    href={watchLogo}
                    target="_blank"
                    rel="noopener noreferrer"
                    color="content.link"
                    fontSize="xs"
                    truncate
                    maxW="100%"
                    _hover={{ textDecoration: "underline" }}
                  >
                    {watchLogo}
                  </Link>
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
            <Button onClick={closeFunction} w="200px" h="64px" variant="outline">
              {t("cancel")}
            </Button>
            <Button
              onClick={handleSubmit(handleFormSubmit)}
              w="200px"
              h="64px"
              loading={isLoading}
            >
              {t("save-module")}
            </Button>
          </Flex>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};

export default EditModuleModal;
