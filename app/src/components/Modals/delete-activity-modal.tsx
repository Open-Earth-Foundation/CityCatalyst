"use client";

import { ActivityValue } from "@/models/ActivityValue";
import { useDeleteActivityValueMutation } from "@/services/api";
import { Text, Box, Badge, DialogTitle, Icon } from "@chakra-ui/react";
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
  DialogRoot,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { MdCheckCircle } from "react-icons/md";
import { toaster } from "../ui/toaster";

interface DeleteAllActivitiesModalProps {
  isOpen: boolean;
  onClose: any;
  t: TFunction;
  selectedActivityValue: ActivityValue;
  resetSelectedActivityValue: () => void;
  inventoryId: string;
  setDeleteActivityDialogOpen: Function;
}

const DeleteActivityModal: FC<DeleteAllActivitiesModalProps> = ({
  isOpen,
  onClose,
  t,
  selectedActivityValue,
  resetSelectedActivityValue,
  inventoryId,
  setDeleteActivityDialogOpen,
}) => {
  const [deleteActivityValue, { isLoading }] = useDeleteActivityValueMutation();

  // define the function to delete all activities
  const handleDeleteActivity = async () => {
    // call the delete all activities mutation
    const response = await deleteActivityValue({
      inventoryId,
      activityValueId: selectedActivityValue.id,
    });
    if (response.data?.success) {
      // TODO create toast wrapper for success state
      toaster.create({
        status: "success",
        title: t("delete-activity-success"),
        render: ({ title }) => (
          <Box
            h="48px"
            w="600px"
            borderRadius="8px"
            display="flex"
            alignItems="center"
            color="white"
            backgroundColor="interactive.primary"
            gap="8px"
            px="16px"
          >
            <Icon as={MdCheckCircle} />
            <Text>{title}</Text>
          </Box>
        ),
      });
      onClose();
      resetSelectedActivityValue();
    } else {
      toaster.create({
        status: "error",
        title: t("delete-activity-failed"),
      });
    }
  };
  return (
    <>
      <DialogRoot
        blockScrollOnMount={false}
        open={isOpen}
        onOpenChange={(e: any) => setDeleteActivityDialogOpen(e.open)}
      >
        <DialogBackdrop />
        <DialogContent minH="388px" minW="568px" marginTop="10%">
          <DialogHeader
            display="flex"
            data-testid="delete-activity-modal-header"
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
            <DialogTitle>{t("delete-activity")}</DialogTitle>
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
                  <Trans t={t} i18nKey="delete-activity-prompt">
                    Are you sure you want to{" "}
                    <span style={{ fontWeight: "bold" }}>
                      permanently delete
                    </span>{" "}
                    this activity from the city&apos;s inventory data?
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
              data-testid="delete-activity-modal-confirm"
              loading={isLoading}
              onClick={handleDeleteActivity}
              paddingBottom="16px"
              px="24px"
              letterSpacing="widest"
              textTransform="uppercase"
              fontWeight="semibold"
              fontSize="button.md"
              type="button"
              p={0}
              m={0}
            >
              {t("delete-activity")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </>
  );
};

export default DeleteActivityModal;
