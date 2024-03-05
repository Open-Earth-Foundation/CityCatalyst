"use client";

import { ProfileInputs } from "@/app/[lng]/settings/page";
import type { UserAttributes } from "@/models/User";
import { api } from "@/services/api";
import {
  Box,
  Button,
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
import { FC, useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { MdCheckCircleOutline } from "react-icons/md";
import FormInput from "../form-input";
import FormSelectInput from "../form-select-input";
import FormSelectOrganization from "../form-select-organization";
import { TFunction } from "i18next";

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  cityId: string | undefined;
  t: TFunction;
}

const AddUserModal: FC<AddUserModalProps> = ({
  isOpen,
  onClose,
  t,
  cityId,
}) => {
  const {
    handleSubmit,
    register,
    formState: { errors },
  } = useForm<ProfileInputs>();
  const [addUser] = api.useAddUserMutation();
  const [inputValue, setInputValue] = useState<string>("");
  const toast = useToast();
  const onInputChange = (e: any) => {
    setInputValue(e.target.value);
  };
  const onSubmit: SubmitHandler<UserAttributes> = async (data) => {
    await addUser({
      name: data.name!,
      email: data.email!,
      role: data.role!,
      cityId: cityId!,
    }).then((res: any) => {
      if (res.error) {
        return toast({
          description: t("something-went-wrong"),
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
                  {t("something-went-wrong")}
                </Text>
              </Box>
            </Box>
          ),
        });
      } else {
        onClose();
        return toast({
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
            fontFamily="heading"
            lineHeight="32"
            padding="24px"
            borderBottomWidth="1px"
            borderStyle="solid"
            borderColor="border.neutral"
          >
            {t("add-user")}
          </ModalHeader>
          <ModalCloseButton marginTop="10px" />
          <ModalBody p={6} px={12}>
            <form onSubmit={handleSubmit(onSubmit)}>
              <Box display="flex" flexDirection="column" gap="24px">
                <FormInput
                  id="name"
                  error={errors.name}
                  label={t("full-name")}
                  register={register}
                />
                <FormInput
                  id="email"
                  error={errors.email}
                  label={t("email")}
                  register={register}
                />

                <FormSelectInput
                  label={t("role")}
                  value={inputValue}
                  register={register}
                  error={errors.role}
                  id="role"
                  onInputChange={onInputChange}
                />
                <FormSelectOrganization
                  label={t("is-organization")}
                  value={inputValue}
                  register={register}
                  error={errors.role}
                  id="isOrganization"
                  onInputChange={onInputChange}
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
              {t("add-user")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default AddUserModal;
