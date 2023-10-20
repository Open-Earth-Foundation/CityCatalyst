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
} from "@chakra-ui/react";
import React, { FC, useEffect } from "react";
import { useForm } from "react-hook-form";
import FormInput from "../form-input";
import FormSelectInput from "../form-select-input";
import { useSession } from "next-auth/react";
import { Session } from "next-auth";

interface UpdateUserModalProps {
  isOpen: boolean;
  onClose: any;
  userData: UserDetails;
}

const UpdateUserModal: FC<UpdateUserModalProps> = ({
  isOpen,
  onClose,
  userData,
}) => {
  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<ProfileInputs>();

  useEffect(() => {
    setValue("name", userData.name!);
    setValue("email", userData.email!);
    setValue("role", userData.role);
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
            <form
              onSubmit={handleSubmit(() => {
                alert("hello");
              })}
            >
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
                  value="admin"
                  register={register}
                  error={errors.role}
                  id="role"
                  onInputChange={() => {}}
                />
                <Button
                  h="56px"
                  paddingTop="16px"
                  paddingBottom="16px"
                  paddingLeft="24px"
                  paddingRight="24px"
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
