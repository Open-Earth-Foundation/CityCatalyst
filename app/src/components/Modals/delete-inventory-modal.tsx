"use client";

import { UserDetails } from "@/app/[lng]/settings/page";
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
} from "@chakra-ui/react";
import React, { FC } from "react";

import { FiTrash2 } from "react-icons/fi";
import PasswordInput from "../password-input";
import { useForm } from "react-hook-form";
import { useTranslation } from "@/i18n/client";
import { TFunction } from "i18next";
import { InfoIcon, InfoOutlineIcon } from "@chakra-ui/icons";

interface DeleteInventoryModalProps {
  isOpen: boolean;
  onClose: any;
  userData: UserDetails;
  tf: TFunction;
  lng: string;
}

const DeleteInventoryModal: FC<DeleteInventoryModalProps> = ({
  isOpen,
  onClose,
  userData,
  lng,
  tf,
}) => {
  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<{ password: string }>();
  const { t } = useTranslation(lng, "dashboard");
  return (
    <>
      <Modal blockScrollOnMount={false} isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent minH="520px" minW="568px" marginTop="10%">
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
          >
            Delete Inventory
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
                  Are you sure you want to{" "}
                  <span style={{ fontWeight: "bold" }}>permanently delete</span>{" "}
                  this city&pos;s from CityCatalyst?
                </Text>
              </Box>
              <Box>
                <form>
                  <Box
                    display="flex"
                    flexDirection="column"
                    justifyContent="center"
                    alignItems="center"
                    gap="24px"
                  >
                    <Box
                      display="flex"
                      flexDirection="column"
                      justifyContent="center"
                      alignItems="center"
                      gap="8px"
                    >
                      <PasswordInput
                        w="365px"
                        error={errors.password}
                        register={register}
                        t={tf}
                        name="Password"
                      />
                      <Box
                        display="flex"
                        justifyContent="center"
                        w="365px"
                        gap="6px"
                      >
                        <InfoOutlineIcon color="interactive.secondary" />
                        <Text
                          fontSize="body.md"
                          fontStyle="normal"
                          lineHeight="20px"
                          fontFamily="heading"
                          color="content.tertiary"
                          letterSpacing="wide"
                        >
                          Enter your password to confirm the deletion of the
                          cities information.
                        </Text>
                      </Box>
                    </Box>
                    <Button
                      h="56px"
                      w="472px"
                      background="sentiment.negativeDefault"
                      paddingTop="16px"
                      paddingBottom="16px"
                      px="24px"
                      letterSpacing="widest"
                      textTransform="uppercase"
                      fontWeight="semibold"
                      fontSize="button.md"
                      type="button"
                      onClick={() => alert(userData.id)}
                    >
                      Remove City
                    </Button>
                  </Box>
                </form>
              </Box>
            </Box>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
};

export default DeleteInventoryModal;
