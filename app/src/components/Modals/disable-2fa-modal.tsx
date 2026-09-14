"use client";

import { Badge, Box, Button, Icon, Text } from "@chakra-ui/react";
import { FC, useState } from "react";

import { GrInsecure } from "react-icons/gr";
import PasswordInput from "../password-input";
import { SubmitHandler, useForm } from "react-hook-form";
import { TFunction } from "i18next";
import { MdInfoOutline, MdErrorOutline } from "react-icons/md";
import { api } from "@/services/api";

import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
} from "@/components/ui/dialog";

import { UseSuccessToast } from "@/hooks/Toasts";

interface DeleteCityDialogProps {
  isOpen: boolean;
  onClose: () => void;
  t: TFunction;
}

const Disable2FAModal: FC<DeleteCityDialogProps> = ({ isOpen, onClose, t }) => {
  const {
    handleSubmit,
    register,
    formState: { errors },
  } = useForm<{ password: string }>();

  const [disableSecondFactorAuth, { isLoading: isDisableLoading }] =
    api.useDisableSecondFactorAuthMutation();
  const { showSuccessToast } = UseSuccessToast({
    title: t("two-factor-disabled"),
    duration: 5000,
  });

  const [isPasswordCorrect, setIsPasswordCorrect] = useState(true);

  const onSubmit: SubmitHandler<{ password: string }> = async ({
    password,
  }) => {
    try {
      const result = await disableSecondFactorAuth({ password }).unwrap();
      console.log("disable result", result);
      if (result.success) {
        onClose();
        showSuccessToast();
        setIsPasswordCorrect(true);
      }
    } catch (error) {
      if (error.data.error.message === "Invalid password") {
        setIsPasswordCorrect(false);
      }
      console.log("Disable 2FA error:", error);
    }
  };

  return (
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
          {t("two-factor-disable-title")}
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
                <GrInsecure size={36} />
              </Badge>
              <Text
                textAlign="center"
                w="408px"
                fontSize="body.large"
                letterSpacing="wide"
                fontStyle="normal"
              >
                {t("two-factor-disable-confirm-message")}
              </Text>
            </Box>
            <Box>
              <form onSubmit={handleSubmit(onSubmit)}>
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
                      {isPasswordCorrect ? (
                        <Text
                          fontSize="body.md"
                          fontStyle="normal"
                          lineHeight="20px"
                          fontFamily="heading"
                          color="content.tertiary"
                          letterSpacing="wide"
                        >
                          <Icon
                            as={MdInfoOutline}
                            color="interactive.secondary"
                            boxSize={4}
                            mt={-1}
                            mr={1}
                          />
                          {t("two-factor-disable-password-message")}
                        </Text>
                      ) : (
                        <Text
                          fontSize="body.md"
                          fontStyle="normal"
                          lineHeight="20px"
                          fontFamily="heading"
                          color="semantic.danger"
                          letterSpacing="wide"
                        >
                          <Icon
                            as={MdErrorOutline}
                            boxSize={4}
                            mt={-1}
                            mr={1}
                          />
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
            loading={isDisableLoading}
            p={0}
            m={0}
          >
            {t("two-factor-disable-button")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};

export default Disable2FAModal;
