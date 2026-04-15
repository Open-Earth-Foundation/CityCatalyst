"use client";

import React from "react";
import { TFunction } from "i18next";
import { Badge, HStack, Text } from "@chakra-ui/react";
import { FiTrash2 } from "react-icons/fi";
import { Trans } from "react-i18next";
import {
  DialogBackdrop,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/services/api";
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";
import type { ModuleAttributes } from "@/models/Module";

interface DeleteModuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenChange: (val: boolean) => void;
  module: ModuleAttributes | null;
  t: TFunction;
}

const DeleteModuleModal = (props: DeleteModuleModalProps) => {
  const { onClose, isOpen, onOpenChange, module, t } = props;

  const { showErrorToast } = UseErrorToast({
    title: t("module-delete-error"),
  });
  const { showSuccessToast } = UseSuccessToast({
    title: t("module-deleted"),
    duration: 1200,
  });

  const [deleteModule, { isLoading }] = api.useDeleteModuleMutation();

  const handleDelete = async () => {
    if (!module) return;

    const response = await deleteModule(module.id);

    if (response.data !== undefined) {
      showSuccessToast();
      onClose();
    } else {
      showErrorToast();
    }
  };

  const closeFunction = () => {
    onClose();
  };

  const moduleName = module?.name?.en || module?.id || "";

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
          justifyContent="center"
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
          {t("delete-module")}
        </DialogHeader>
        <DialogCloseTrigger mt="2" color="interactive.control" mr="2" />
        <HStack flexDirection="column" alignItems="center" padding="24px">
          <Badge
            color="sentiment.negativeDefault"
            h="68px"
            w="68px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            borderRadius="full"
            background="sentiment.negativeOverlay"
          >
            <FiTrash2 size={36} />
          </Badge>
          <Text
            w="full"
            maxW="450px"
            textAlign="center"
            mt={6}
            fontSize="body.lg"
          >
            <Trans
              i18nKey="confirm-module-delete"
              t={t}
              values={{ name: moduleName }}
              components={{ bold: <strong /> }}
            />
          </Text>
        </HStack>
        <DialogFooter
          paddingX={6}
          paddingY={6}
          borderTop="2px"
          borderColor="background.neutral"
          borderStyle="solid"
        >
          <Button
            variant="solid"
            h="64px"
            w="full"
            onClick={handleDelete}
            color="base.light"
            backgroundColor="sentiment.negativeDefault"
            marginRight="2"
            loading={isLoading}
          >
            {t("delete-module")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};

export default DeleteModuleModal;
