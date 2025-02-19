"use client";

import { Badge, Box, Button, Text, Icon } from "@chakra-ui/react";
import React, { FC, useState } from "react";

import { FiTrash2 } from "react-icons/fi";
import PasswordInput from "../password-input";
import { SubmitHandler, useForm } from "react-hook-form";
import { TFunction } from "i18next";
import { MdInfoOutline } from "react-icons/md";
import { api } from "@/services/api";
import type { CityAttributes } from "@/models/City";

import {
  DialogRoot,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";

import { toaster } from "@/components/ui/toaster";

interface DeleteCityDialogProps {
  isOpen: boolean;
  onClose: any;
  cityData: CityAttributes;
  t: TFunction;
}

const DeleteCityDialog: FC<DeleteCityDialogProps> = ({
  isOpen,
  onClose,
  cityData,
  t,
}) => {
  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<{ password: string }>();

  const [requestPasswordConfirm] = api.useRequestVerificationMutation();
  const { data: token } = api.useGetVerifcationTokenQuery({});
  const [removeCity] = api.useRemoveCityMutation();
  const [isPasswordCorrect, setIsPasswordCorrect] = useState<boolean>(true);

  const onSubmit: SubmitHandler<{ password: string }> = async (data) => {
    await requestPasswordConfirm({
      password: data.password!,
      token: token?.verificationToken!,
    }).then(async (res: any) => {
      if (res.data?.comparePassword) {
        await removeCity({
          cityId: cityData.cityId!,
        }).then((res: any) => {
          onClose();
          setIsPasswordCorrect(true);
          toaster.success({
            description: t("city-deleted"),
            duration: 5000,
          });
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
          <DialogHeader
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
            {t("remove-city")}
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
                  Are you sure you want to{" "}
                  <span style={{ fontWeight: "bold" }}>
                    permanently remove this city
                  </span>{" "}
                  from CityCatalyst?
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
                        t={t}
                        name="Password"
                      />
                      <Box
                        display="flex"
                        justifyContent="center"
                        w="365px"
                        gap="6px"
                      >
                        <Icon
                          as={MdInfoOutline}
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
                            {t("enter-password-description")}
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
                </form>
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
              paddingTop="16px"
              paddingBottom="16px"
              px="24px"
              bg="sentiment.negativeDefault"
              letterSpacing="widest"
              textTransform="uppercase"
              fontWeight="semibold"
              fontSize="button.md"
              type="submit"
              onClick={handleSubmit(onSubmit)}
              p={0}
              m={0}
            >
              {t("remove-city")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </>
  );
};

export default DeleteCityDialog;
