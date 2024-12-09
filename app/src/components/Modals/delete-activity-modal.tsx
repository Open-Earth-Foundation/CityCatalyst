"use client";

import { ActivityValue } from "@/models/ActivityValue";
import { useDeleteActivityValueMutation } from "@/services/api";
import {
  Modal,
  Button,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Text,
  Box,
  Badge,
  ModalFooter,
  useToast,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import React, { FC } from "react";
import { Trans } from "react-i18next";
import { CheckCircleIcon } from "@chakra-ui/icons";

import { FiTrash2 } from "react-icons/fi";

interface DeleteAllActivitiesModalProps {
  isOpen: boolean;
  onClose: any;
  t: TFunction;
  selectedActivityValue: ActivityValue;
  resetSelectedActivityValue: () => void;
  inventoryId: string;
}

const DeleteActivityModal: FC<DeleteAllActivitiesModalProps> = ({
  isOpen,
  onClose,
  t,
  selectedActivityValue,
  resetSelectedActivityValue,
  inventoryId,
}) => {
  const toast = useToast();
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
      toast({
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
            <CheckCircleIcon />
            <Text>{title}</Text>
          </Box>
        ),
      });
      onClose();
      resetSelectedActivityValue();
    } else {
      toast({
        status: "error",
        title: t("delete-activity-failed"),
      });
    }
  };
  return (
    <>
      <Modal
        blockScrollOnMount={false}
        isOpen={isOpen}
        onClose={() => {
          onClose();
          resetSelectedActivityValue();
        }}
      >
        <ModalOverlay />
        <ModalContent minH="388px" minW="568px" marginTop="10%">
          <ModalHeader
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
            {t("delete-activity")}
          </ModalHeader>
          <ModalCloseButton marginTop="10px" />
          <ModalBody paddingTop="24px">
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
          </ModalBody>
          <ModalFooter
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
              isLoading={isLoading}
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
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default DeleteActivityModal;
