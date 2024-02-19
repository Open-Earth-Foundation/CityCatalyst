"use client";

import { ProfileInputs } from "@/app/[lng]/settings/page";
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
import { MdCheckCircleOutline } from "react-icons/md";
import { api } from "@/services/api";
import { UserAttributes } from "@/models/User";
import FormSelectOrganization from "../form-select-organization";

interface AddUserModalProps {
  isOpen: boolean;
  onClose: any;
  userInfo: UserAttributes;
}

const AddUserModal: FC<AddUserModalProps> = ({ isOpen, onClose, userInfo }) => {
  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<ProfileInputs>();
  const [addUser] = api.useAddUserMutation();
  const [inviteUser] = api.useInviteUserMutation();
  const [inputValue, setInputValue] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const toast = useToast();
  const onInputChange = (e: any) => {
    setInputValue(e.target.value);
  };
  const onSubmit: SubmitHandler<UserAttributes> = async (data) => {
    // TODO
    // Submit data via the api

    await addUser({
      locode: userInfo.defaultCityLocode!,
      name: data.name!,
      email: data.email!,
      role: data.role!,
      isOrganization:
        (data.isOrganization as unknown) === "true" ? true : false,
    }).then(async (res: any) => {
      if (res.error) {
        return toast({
          description: "Something went wrong",
          status: "error",
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
              bg="sentiment.negativeDefault"
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
                  Something went wrong
                </Text>
              </Box>
            </Box>
          ),
        });
      } else {
        await inviteUser({
          userId: res && res.data.data.userId!,
          locode: userInfo.defaultCityLocode!,
        }).then((res: any) => {
          onClose();
          return toast({
            description: "User invite sent",
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
                    User invite sent
                  </Text>
                </Box>
              </Box>
            ),
          });
        });
      }
    });
  };

  return (
    <>
      <Modal blockScrollOnMount={false} isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent minH="600px" minW="568px" marginTop="10%">
          <ModalHeader
            display="flex"
            justifyContent="center"
            fontWeight="semibold"
            fontSize="headline.sm"
            lineHeight="32"
            padding="24px"
            borderBottom={"1px solid #fafafa"}
          >
            Add User
          </ModalHeader>
          <ModalCloseButton marginTop="10px" />
          <ModalBody>
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
                  onInputChange={onInputChange}
                />
                <FormSelectOrganization
                  label="Is organization"
                  value={inputValue}
                  register={register}
                  error={errors.role}
                  id="isOrganization"
                  onInputChange={onInputChange}
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
                  Add user
                </Button>
              </Box>
            </form>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
};

export default AddUserModal;
