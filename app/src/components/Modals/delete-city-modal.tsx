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
  useToast,
} from "@chakra-ui/react";
import React, { FC, useState } from "react";

import { FiTrash2 } from "react-icons/fi";
import PasswordInput from "../password-input";
import { SubmitHandler, useForm } from "react-hook-form";
import { useTranslation } from "@/i18n/client";
import { TFunction } from "i18next";
import { InfoIcon, InfoOutlineIcon } from "@chakra-ui/icons";
import { UserAttributes } from "@/models/User";
import { api } from "@/services/api";
import { CityAttributes } from "@/models/City";
import { MdCheckCircleOutline } from "react-icons/md";

interface DeleteCityModalProps {
  isOpen: boolean;
  onClose: any;
  userData: UserAttributes;
  cityData: CityAttributes;
  tf: TFunction;
  lng: string;
}

const DeleteCityModal: FC<DeleteCityModalProps> = ({
  isOpen,
  onClose,
  userData,
  cityData,
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
  const [requestPasswordConfirm] = api.useRequestVerificationMutation();
  const { data: token } = api.useGetVerifcationTokenQuery({
    skip: !userData,
  });
  const [removeCity] = api.useRemoveCityMutation();
  const [isPasswordCorrect, setIsPasswordCorrect] = useState<boolean>(true);
  const toast = useToast();

  const onSubmit: SubmitHandler<{ password: string }> = async (data) => {
    await requestPasswordConfirm({
      password: data.password!,
      token: token?.verificationToken!,
    }).then(async (res: any) => {
      if (res.data?.comparePassword) {
        await removeCity({
          locode: cityData.locode!,
        }).then((res: any) => {
          onClose();
          setIsPasswordCorrect(true);
          toast({
            description: "User details updated!",
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
                    City deleted successfully
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
          >
            Remove City
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
                  <span style={{ fontWeight: "bold" }}>
                    permanently remove this city
                  </span>{" "}
                  from CityCatalyst?
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
                        {isPasswordCorrect ? (
                          <Text
                            fontSize="body.md"
                            fontStyle="normal"
                            lineHeight="20px"
                            fontFamily="heading"
                            color="content.tertiary"
                            letterSpacing="wide"
                          >
                            {tf("enter-password-description")}
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
                            {tf("incorrect-password")}
                          </Text>
                        )}
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
                      type="submit"
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

export default DeleteCityModal;
