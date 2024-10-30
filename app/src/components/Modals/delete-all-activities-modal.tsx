"use client";

import { UserFileAttributes } from "@/models/UserFile";
import {
  api,
  useDeleteActivityValueMutation,
  useDeleteAllActivityValuesMutation,
} from "@/services/api";
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
  inventoryId: string;
  subsectorId: string;
}

const DeleteAllActivitiesModal: FC<DeleteAllActivitiesModalProps> = ({
  isOpen,
  onClose,
  t,
  inventoryId,
  subsectorId,
}) => {
  const toast = useToast();
  const [deleteAllActivityValues, { isLoading }] =
    useDeleteAllActivityValuesMutation();

  // define the function to delete all activities
  const handleDeleteAllActivities = async () => {
    // call the delete all activities mutation
    const response = await deleteAllActivityValues({
      inventoryId,
      subSectorId: subsectorId,
    });
    if (response.data) {
      // TODO create toast wrapper for success state
      toast({
        status: "success",
        title: t("all-activities-deleted"),
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
    } else {
      toast({
        status: "error",
        title: t("delete-all-activities-failed"),
      });
    }
  };

  return (
    <>
      <Modal blockScrollOnMount={false} isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent minH="388px" minW="568px" marginTop="10%">
          <ModalHeader
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
            {t("delete-all-activities")}
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
              isLoading={isLoading}
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
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default DeleteAllActivitiesModal;
