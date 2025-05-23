"use client";

import { Badge, Box, Button, DialogFooter, Icon, Text } from "@chakra-ui/react";
import React, { FC, useState } from "react";
import { FiTrash2 } from "react-icons/fi";
import { MdOutlineInfo } from "react-icons/md";
import { SubmitHandler, useForm } from "react-hook-form";
import { Trans } from "react-i18next/TransWithoutContext";
import { TFunction } from "i18next";

import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { UseSuccessToast } from "@/hooks/Toasts";
import PasswordInput from "@/components/password-input";

import type { UserAttributes } from "@/models/User";
import { api } from "@/services/api";

interface DeleteInventoryDialogProps {
  isOpen: boolean;
  onClose: any;
  userData: UserAttributes;
  t: TFunction;
  inventoryId: string;
}

const DeleteInventoryDialog: FC<DeleteInventoryDialogProps> = ({
  isOpen,
  onClose,
  userData,
  inventoryId,
  t,
}) => {
  const {
    handleSubmit,
    register,
    formState: { errors },
    reset,
  } = useForm<{ password: string }>();
  const [requestPasswordConfirm] = api.useRequestVerificationMutation();
  const { data: token } = api.useGetVerificationTokenQuery({
    skip: !userData,
  });
  const [deleteInventory, { isLoading }] = api.useDeleteInventoryMutation();
  const [isPasswordCorrect, setIsPasswordCorrect] = useState<boolean>(true);

  const { showSuccessToast } = UseSuccessToast({
    title: t("inventory-deleted"),
    duration: 5000,
  });

  const onSubmit: SubmitHandler<{ password: string }> = async (data) => {
    if (!token?.verificationToken) {
      console.error("No verification token found");
      return;
    }

    await requestPasswordConfirm({
      password: data.password!,
      token: token?.verificationToken!,
    }).then(async (res: any) => {
      if (res.data?.comparePassword) {
        await deleteInventory({
          inventoryId,
        }).then((_res: any) => {
          reset();
          onClose();
          setIsPasswordCorrect(true);
          showSuccessToast();
        });
      } else {
        setIsPasswordCorrect(false);
      }
    });
  };

  return (
    <>
      <DialogRoot preventScroll open={isOpen} onOpenChange={onClose}>
        <DialogContent minH="520px" minW="568px" marginTop="10%">
          <form onSubmit={handleSubmit(onSubmit)}>
            <DialogHeader
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
            </DialogHeader>
            <DialogCloseTrigger marginTop="10px" />
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
                  >
                    <Trans t={t} i18nKey="delete-inventory-prompt">
                      Are you sure you want to{" "}
                      <span className="font-bold">permanently delete</span> this
                      city&nbsp;s inventory?
                    </Trans>
                  </Text>
                </Box>
                <Box>
                  <Field>
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
                          name={t("password")}
                        />
                        <Box
                          display="flex"
                          justifyContent="center"
                          w="365px"
                          gap="6px"
                        >
                          <Icon
                            as={MdOutlineInfo}
                            color="interactive.secondary"
                          />
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
                  </Field>
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
                paddingBottom="16px"
                px="24px"
                letterSpacing="widest"
                textTransform="uppercase"
                fontWeight="semibold"
                fontSize="button.md"
                type="submit"
                loading={isLoading}
                onClick={handleSubmit(onSubmit)}
                p={0}
                m={0}
              >
                {t("delete-inventory")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </DialogRoot>
    </>
  );
};

export default DeleteInventoryDialog;
