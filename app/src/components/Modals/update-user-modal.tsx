"use client";

import { ProfileInputs, UserDetails } from "@/app/[lng]/settings/page";
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
import { useSession } from "next-auth/react";
import { Session } from "next-auth";
import { UserAttributes } from "@/models/User";
import { MdCheckCircleOutline } from "react-icons/md";
import { api } from "@/services/api";

interface UpdateUserModalProps {
  isOpen: boolean;
  onClose: any;
  userData: UserAttributes;
  userInfo: UserAttributes;
}

const UpdateUserModal: FC<UpdateUserModalProps> = ({
  isOpen,
  onClose,
  userData,
  userInfo,
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
                User details updated
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
            borderStyle="solid"
            borderColor="border.neutral"
          >
            Update User
          </ModalHeader>
          <ModalCloseButton marginTop="10px" />
          <ModalBody paddingTop="24px">
            <form onSubmit={handleSubmit(onSubmit)}>
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
                <Button
                  h="56px"
                  paddingTop="16px"
                  paddingBottom="16px"
                  px="24px"
                  letterSpacing="widest"
                  textTransform="uppercase"
                  fontWeight="semibold"
                  fontSize="button.md"
                  w="100%"
                  type="submit"
                >
                  save changes
                </Button>
              </Box>
            </form>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
};

export default UpdateUserModal;
