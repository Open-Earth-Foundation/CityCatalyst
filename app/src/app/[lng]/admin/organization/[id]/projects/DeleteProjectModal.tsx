"use client";
import { TFunction } from "i18next";
import React, { useState } from "react";

import {
  DialogBackdrop,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
} from "@/components/ui/dialog";
import { Badge, Box, HStack, Input, Text } from "@chakra-ui/react";
import { Button } from "@/components/ui/button";
import { FiTrash2 } from "react-icons/fi";
import { Trans } from "react-i18next";
import { Field } from "@/components/ui/field";
import { useDeleteProjectMutation } from "@/services/api";
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";

interface DeleteProjectModalProps {
  projectId: string;
  projectName: string;
  isOpen: boolean;
  onClose: () => void;
  t: TFunction;
  onOpenChange: (val: boolean) => void;
}

const DeleteProjectModal = (props: DeleteProjectModalProps) => {
  const { projectId, projectName, onClose, isOpen, onOpenChange, t } = props;

  const { showErrorToast } = UseErrorToast({
    title: t("error-message"),
  });
  const { showSuccessToast } = UseSuccessToast({
    title: t("project-deleted"),
    duration: 1200,
  });

  const [projectToDelete, setProjectToDelete] = useState("");
  const handleDelete = async () => {};
  const [deleteProject, { isLoading }] = useDeleteProjectMutation();

  const [step, setStep] = useState(1);

  const nextFunction = () => {
    setStep(2);
  };

  const submitFunction = async () => {
    if (!(projectToDelete.trim() === projectName.trim())) {
      return;
    }

    const response = await deleteProject(projectId);

    if (response.data) {
      showSuccessToast();
      onClose();
      setStep(1);
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
          onClose();
          setStep(1);
        }
      }}
      onExitComplete={() => {
        setStep(1);
        onClose();
      }}
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
          {t("delete-project")}
        </DialogHeader>
        <DialogCloseTrigger mt={"2"} color="interactive.control" mr={"2"} />
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
          {step === 1 ? (
            <Box w="65%" textAlign="center" mt={6}>
              <Text fontSize="body.lg">
                <Trans
                  i18nKey="confirm-project-delete"
                  t={t}
                  values={{
                    name: projectName,
                  }}
                  components={{
                    bold: <strong />,
                  }}
                />
              </Text>
              <Text fontSize="body.lg" mt={4}>
                {t("delete-all-inventories-warning")}
              </Text>
            </Box>
          ) : (
            <Box w="70%" mt={6}>
              <Text fontSize="body.lg" textAlign="center">
                <Trans
                  i18nKey="enter-project-name-confirmation"
                  t={t}
                  values={{
                    name: projectName,
                  }}
                  components={{
                    bold: <strong />,
                  }}
                />
              </Text>
              <Field
                labelClassName="font-semibold"
                mt={6}
                label={t("project-name")}
              >
                <Input
                  value={projectToDelete}
                  onChange={(e) => setProjectToDelete(e.target.value)}
                />
              </Field>
            </Box>
          )}
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
            disabled={
              step === 2 && projectToDelete.trim() !== projectName.trim()
            }
            w="full"
            onClick={step === 1 ? nextFunction : submitFunction}
            color="base.light"
            backgroundColor="sentiment.negativeDefault"
            marginRight="2"
            loading={isLoading}
          >
            {step === 1 ? t("yes-i-understand") : t("delete-project")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};

export default DeleteProjectModal;
