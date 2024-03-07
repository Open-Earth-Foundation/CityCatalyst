"use client";

import type { UserAttributes } from "@/models/User";
import { api } from "@/services/api";
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
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import React, { FC } from "react";
import { Trans } from "react-i18next";

import { FiTrash2 } from "react-icons/fi";

interface DeleteUserModalProps {
  isOpen: boolean;
  onClose: any;
  userData: UserAttributes;
  cityId: string;
  t: TFunction;
}

const DeleteUserModal: FC<DeleteUserModalProps> = ({
  isOpen,
  onClose,
  userData,
  cityId,
  t,
}) => {
  const [removeUser] = api.useRemoveUserMutation();
  const handleDeleteUser = async (userId: string, cityId: string) => {
    await removeUser({ userId, cityId }).then(() => {
      onClose();
    });
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
            lineHeight="32"
            padding="24px"
            borderBottomWidth="1px"
            borderStyle="solid"
            borderColor="border.neutral"
            fontFamily="heading"
          >
            {t("remove-user")}
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
                  fontFamily="heading"
                  w="408px"
                  fontSize="body.large"
                  letterSpacing="wide"
                  fontStyle="normal"
                >
                  <Trans t={t} i18nKey="remove-user-prompt">
                    Are you sure you want to{" "}
                    <span style={{ fontWeight: "bold" }}>
                      permanently remove this user
                    </span>{" "}
                    from your team?
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
              paddingTop="16px"
              paddingBottom="16px"
              px="24px"
              bg="sentiment.negativeDefault"
              letterSpacing="widest"
              textTransform="uppercase"
              fontWeight="semibold"
              fontSize="button.md"
              type="submit"
              onClick={() => handleDeleteUser(userData.userId, cityId)}
              p={0}
              m={0}
            >
              {t("remove-user")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default DeleteUserModal;
