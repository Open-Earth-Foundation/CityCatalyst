"use client";

import {
  Badge,
  Box,
  Button,
  FormControl,
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
import React, { FC, useState } from "react";

import { FiTrash2 } from "react-icons/fi";
import PasswordInput from "../password-input";
import { SubmitHandler, useForm } from "react-hook-form";
import { Trans } from "react-i18next/TransWithoutContext";
import { TFunction } from "i18next";
import { InfoOutlineIcon } from "@chakra-ui/icons";
import { UserAttributes } from "@/models/User";
import { api } from "@/services/api";
import { MdCheckCircleOutline } from "react-icons/md";

interface DeleteInventoryModalProps {
  isOpen: boolean;
  onClose: any;
  userData: UserAttributes;
  t: TFunction;
  lng: string;
  inventoryId: string;
}

const DeleteInventoryModal: FC<DeleteInventoryModalProps> = ({
  isOpen,
  onClose,
  userData,
  lng,
  inventoryId,
  t,
}) => {
  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting },
    setValue,
    reset,
  } = useForm<{ password: string }>();
  const [requestPasswordConfirm] = api.useRequestVerificationMutation();
  const { data: token } = api.useGetVerifcationTokenQuery({
    skip: !userData,
  });
  const [deleteInventory] = api.useDeleteInventoryMutation();
  const [isPasswordCorrect, setIsPasswordCorrect] = useState<boolean>(true);
  const toast = useToast();

  const onSubmit: SubmitHandler<{ password: string }> = async (data) => {
    await requestPasswordConfirm({
      password: data.password!,
      token: token?.verificationToken!,
    }).then(async (res: any) => {
      if (res.data?.comparePassword) {
        await deleteInventory({
          inventoryId,
        }).then((res: any) => {
          reset();
          onClose();
          setIsPasswordCorrect(true);
          toast({
            description: t("inventory-deleted"),
            status: "success",
            duration: 5000,
            isClosable: true,
            render: () => (
              <Box
                display="flex"
                gap="8px"
                color="white"
                alignItems="center"
                justifyContent="space-between"
                p={3}
                bg="interactive.primary"
                width="600px"
                height="60px"
                borderRadius="8px"
              >
                <Box display="flex" gap="8px" alignItems="center">
                  <MdCheckCircleOutline fontSize="24px" />

                  <Text
                    color="base.light"
                    fontWeight="bold"
                    lineHeight="52"
                    fontSize="label.lg"
                  >
                    {t("inventory-deleted")}
                  </Text>
                </Box>
              </Box>
            ),
          });
        });
      } else {
        setIsPasswordCorrect(false);
      }
    });
  };

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
            fontFamily="heading"
          >
            {t("delete-inventory")}
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
                >
                  <Trans t={t} i18nKey="delete-inventory-prompt">
                    Are you sure you want to{" "}
                    <span className="font-bold">permanently delete</span> this
                    city&nbsp;s inventory?
                  </Trans>
                </Text>
              </Box>
              <Box>
                <FormControl>
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
                        t={t}
                        name="Password"
                      />
                      <Box
                        display="flex"
                        justifyContent="center"
                        w="365px"
                        gap="6px"
                      >
                        <InfoOutlineIcon color="interactive.secondary" />
                        {isPasswordCorrect ? (
                          <Text
                            fontSize="body.md"
                            fontStyle="normal"
                            lineHeight="20px"
                            fontFamily="heading"
                            color="content.tertiary"
                            letterSpacing="wide"
                          >
                            {t("enter-password-info")}
                          </Text>
                        ) : (
                          <Text
                            fontSize="body.md"
                            fontStyle="normal"
                            lineHeight="20px"
                            fontFamily="heading"
                            color="content.tertiary"
                            letterSpacing="wide"
                          >
                            {t("incorrect-password")}
                          </Text>
                        )}
                      </Box>
                    </Box>
                  </Box>
                </FormControl>
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
              paddingBottom="16px"
              px="24px"
              letterSpacing="widest"
              textTransform="uppercase"
              fontWeight="semibold"
              fontSize="button.md"
              type="submit"
              onClick={handleSubmit(onSubmit)}
              p={0}
              m={0}
            >
              {t("delete-inventory")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default DeleteInventoryModal;
