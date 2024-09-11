"use client";

import {
  Box,
  Button,
  Icon,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  useToast,
} from "@chakra-ui/react";
import React, { FC } from "react";
import { TFunction } from "i18next";
import { CheckCircleIcon } from "@chakra-ui/icons";
import { useDeleteAllActivityValuesMutation } from "@/services/api";
import { ChangeMethodologyIcon } from "../icons";
import { Trans } from "react-i18next";

interface ChangeMethodologyProps {
  isOpen: boolean;
  onClose: () => void;
  onChangeClicked: () => void;
  t: TFunction;
  gpcReferenceNumber: string;
  inventoryId: string;
}

const ChangeMethodology: FC<ChangeMethodologyProps> = ({
  isOpen,
  onClose,
  onChangeClicked,
  t,
  gpcReferenceNumber,
  inventoryId,
}) => {
  const toast = useToast();

  const [deleteAllActivityValues, { isLoading }] =
    useDeleteAllActivityValuesMutation();

  const handleDeleteAllActivities = async () => {
    // call the delete all activities mutation
    const response = await deleteAllActivityValues({
      inventoryId,
      gpcReferenceNumber: gpcReferenceNumber,
    });
    if (response.data) {
      // TODO create toast wrapper for success state
      toast({
        status: "success",
        title: t("change-methodology-success"),
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
      onChangeClicked();
      onClose();
    } else {
      toast({
        status: "error",
        title: t("change-methodology-error"),
      });
    }
  };

  // when the user clicks the change methodology button we will call the handleDeleteAllActivities function

  return (
    <>
      <Modal blockScrollOnMount={false} isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent minH="350px" minW="568px" marginTop="2%">
          <ModalHeader
            display="flex"
            justifyContent="center"
            fontWeight="semibold"
            fontSize="headline.sm"
            lineHeight="32"
            padding="24px"
            fontFamily="heading"
            borderBottomWidth="1px"
            borderStyle="solid"
            borderColor="border.neutral"
          >
            {t("change-methodology")}
          </ModalHeader>
          <ModalCloseButton marginTop="10px" />
          <ModalBody paddingTop="24px" paddingBottom="48px">
            <Box
              h="full"
              w="full"
              display="flex"
              alignItems="center"
              justifyContent="center"
              flexDirection="column"
              gap="48px"
            >
              <Box
                h="68px"
                w="68px"
                bg="background.neutral"
                display="flex"
                alignItems="center"
                justifyContent="center"
                borderRadius="full"
              >
                <Icon as={ChangeMethodologyIcon} color="content.link" />
              </Box>
              <Text textAlign="center">
                <Trans t={t} i18nKey={"change-methodology-description-text"}>
                  Please be aware that{" "}
                  <Text as="span" fontWeight="bold">
                    changing methodology may impact your existing inventory
                    data.
                  </Text>{" "}
                  Are you sure you want to proceed with changing your
                  methodology?
                </Trans>
              </Text>
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
              isLoading={isLoading}
              paddingTop="16px"
              paddingBottom="16px"
              px="24px"
              bg="interactive.secondary"
              letterSpacing="widest"
              textTransform="uppercase"
              fontWeight="semibold"
              fontSize="button.md"
              type="submit"
              p={0}
              m={0}
              onClick={handleDeleteAllActivities}
            >
              {t("change-methodology")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default ChangeMethodology;
