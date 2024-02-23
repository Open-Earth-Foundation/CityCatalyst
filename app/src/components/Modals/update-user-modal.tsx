"use client";

import {
  Modal,
  Button,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  ModalProps,
  Input,
  FormControl,
  FormLabel,
  Box,
  useToast,
} from "@chakra-ui/react";
import React, { FC, useEffect, useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import FormInput from "../form-input";
import FormSelectInput from "../form-select-input";
import { UserAttributes } from "@/models/User";
import { MdCheckCircleOutline } from "react-icons/md";
import { api } from "@/services/api";
import { TFunction } from "i18next";

interface UpdateUserModalProps {
  isOpen: boolean;
  onClose: any;
  userData: UserAttributes;
  userInfo: UserAttributes;
  t: TFunction;
}

const UpdateUserModal: FC<UpdateUserModalProps> = ({
  isOpen,
  onClose,
  userData,
  userInfo,
  t,
}) => {
  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<UserAttributes>();

  const [setUserData] = api.useSetUserDataMutation();

  const toast = useToast();

  const [inputValue, setInputValue] = useState<string>("");

  const onSubmit: SubmitHandler<UserAttributes> = async (data) => {
    // TODO
    // Submit data via the api
    await setUserData({
      cityId: "", // TODO pass currently selected city's ID in here!
      userId: userData.userId,
      name: data.name,
      email: data.email,
      role: data.role,
    }).then(() => {
      onClose();
      toast({
        description: t("user-details-updated"),
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
                {t("user-details-updated")}
              </Text>
            </Box>
          </Box>
        ),
      });
    });
  };

  useEffect(() => {
    setValue("name", userData.name!);
    setValue("email", userData.email!);
    setValue("role", userData.role!);
  }, [setValue, userData]);

  return (
    <>
      <Modal blockScrollOnMount={false} isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent minH="524px" minW="568px" marginTop="10%">
          <ModalHeader
            display="flex"
            justifyContent="center"
            fontWeight="semibold"
            fontSize="headline.sm"
            lineHeight="32"
            padding="24px"
            borderBottomWidth="1px"
            fontFamily="heading"
            borderStyle="solid"
            borderColor="border.neutral"
          >
            {t("edit-user")}
          </ModalHeader>
          <ModalCloseButton marginTop="10px" />
          <ModalBody paddingTop="24px" px="48px">
            <form>
              <Box display="flex" flexDirection="column" gap="24px">
                <FormInput
                  id="name"
                  error={errors.name}
                  label="Full Name"
                  register={register}
                />
                <FormInput
                  id="email"
                  error={errors.email}
                  label="Email"
                  register={register}
                />

                <FormSelectInput
                  label="Role"
                  value={inputValue}
                  register={register}
                  error={errors.role}
                  id="role"
                  onInputChange={(e: any) => setInputValue(e.target.value)}
                />
              </Box>
            </form>
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
              letterSpacing="widest"
              textTransform="uppercase"
              fontWeight="semibold"
              fontSize="button.md"
              type="submit"
              onClick={handleSubmit(onSubmit)}
              p={0}
              m={0}
            >
              {t("save-changes")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default UpdateUserModal;
