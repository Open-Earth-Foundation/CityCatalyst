"use client";

import { useDeleteAllActivityValuesMutation } from "@/services/api";
import { Badge, Box, DialogRoot, Text } from "@chakra-ui/react";
import { TFunction } from "i18next";
import React, { FC } from "react";
import { Trans } from "react-i18next";

import { FiTrash2 } from "react-icons/fi";
import {
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";

interface DeleteAllActivitiesModalProps {
  isOpen: boolean;
  onClose: any;
  t: TFunction;
  inventoryId: string;
  subsectorId: string;
  setDeleteActivityAllDialogOpen: Function;
}

const DeleteAllActivitiesModal: FC<DeleteAllActivitiesModalProps> = ({
  isOpen,
  onClose,
  t,
  inventoryId,
  subsectorId,
  setDeleteActivityAllDialogOpen,
}) => {
  const [deleteAllActivityValues, { isLoading }] =
    useDeleteAllActivityValuesMutation();

  const { showErrorToast } = UseErrorToast({
    title: t("delete-all-activities-failed"),
  });
  const { showSuccessToast } = UseSuccessToast({
    title: t("all-activities-deleted"),
  });

  // define the function to delete all activities
  const handleDeleteAllActivities = async () => {
    // call the delete all activities mutation
    const response = await deleteAllActivityValues({
      inventoryId,
      subSectorId: subsectorId,
    });
    if (response.data) {
      // TODO create toast wrapper for success state
      showSuccessToast();
      onClose();
    } else {
      showErrorToast();
    }
  };

  return (
    <>
      <DialogRoot
        open={isOpen}
        onOpenChange={(e) => setDeleteActivityAllDialogOpen(e.open)}
        onExitComplete={onClose}
      >
        <DialogBackdrop />
        <DialogContent minH="388px" minW="568px" marginTop="10%">
          <DialogHeader
            display="flex"
            justifyContent="center"
            fontWeight="semibold"
            fontSize="headline.sm"
            fontFamily="heading"
            lineHeight="32"
            padding="24px"
            borderBottomWidth="1px"
            borderStyle="solid"
            borderColor="border.neutral"
          >
            <DialogTitle> {t("delete-all-activities")}</DialogTitle>
          </DialogHeader>
          <DialogCloseTrigger />
          <DialogBody paddingTop="24px">
            <Box
              display="flex"
              flexDirection="column"
              gap="24px"
              alignItems="center"
            >
              <Box
                display="flex"
                alignItems="center"
                flexDirection="column"
                justifyContent="center"
                gap="24px"
              >
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
                  textAlign="center"
                  w="408px"
                  fontSize="body.large"
                  letterSpacing="wide"
                  fontStyle="normal"
                  fontFamily="body"
                >
                  <Trans t={t} i18nKey="delete-activities-prompt">
                    Are you sure you want to{" "}
                    <span style={{ fontWeight: "bold" }}>
                      permanently delete
                    </span>{" "}
                    all activities in the commercial and institutional buildings
                    sub-sector from the city&apos;s inventory data?
                  </Trans>
                </Text>
              </Box>
            </Box>
          </DialogBody>
          <DialogFooter
            borderTopWidth="1px"
            borderStyle="solid"
            borderColor="border.neutral"
            w="full"
            display="flex"
            alignItems="center"
            p="24px"
            justifyContent="center"
          >
            <Button
              h="56px"
              w="472px"
              background="sentiment.negativeDefault"
              paddingTop="16px"
              loading={isLoading}
              paddingBottom="16px"
              px="24px"
              letterSpacing="widest"
              textTransform="uppercase"
              fontWeight="semibold"
              onClick={handleDeleteAllActivities}
              fontSize="button.md"
              type="button"
              p={0}
              m={0}
            >
              {t("delete-all-activities")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </>
  );
};

export default DeleteAllActivitiesModal;
