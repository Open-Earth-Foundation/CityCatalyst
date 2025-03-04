"use client";

import { Box, Button } from "@chakra-ui/react";
import React, { FC, useEffect, useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { TFunction } from "i18next";

import { api } from "@/services/api";
import { GetUserCityInvitesResponseUserData, Roles } from "@/util/types";
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";
import FormInput from "@/components/form-input";
import FormSelectInput from "@/components/form-select-input";
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
} from "@/components/ui/dialog";

interface UpdateUserDialogProps {
  isOpen: boolean;
  onClose: any;
  t: TFunction;
  userData: GetUserCityInvitesResponseUserData;
}

const UpdateUserDialog: FC<UpdateUserDialogProps> = ({
  isOpen,
  onClose,
  t,
  userData,
}) => {
  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<GetUserCityInvitesResponseUserData>();

  const [setUserData, { isLoading, error }] = api.useSetUserDataMutation();

  const { showSuccessToast } = UseSuccessToast({
    description: t("user-details-updated"),
    title: t("user-details-updated"),
  });

  const { showErrorToast } = UseErrorToast({
    description: t("user-details-update-fail"),
    title: t("user-details-update-fail"),
  });

  const [inputValue, setInputValue] = useState<string>("");

  const onSubmit: SubmitHandler<GetUserCityInvitesResponseUserData> = async ({
    role,
    email,
    name,
  }) => {
    // Submit data via the api
    await setUserData({
      userId: userData.userId,
      name: name,
      email: email,
      role: role === "admin" ? Roles.Admin : Roles.User,
    }).then(() => {
      onClose();
      if (error) {
        showErrorToast();
      } else {
        showSuccessToast();
      }
    });
  };

  useEffect(() => {
    setValue("name", userData.name!);
    setValue("email", userData.email!);
    setValue("role", userData.role!);
  }, [setValue, userData]);

  return (
    <>
      <DialogRoot
        preventScroll
        open={isOpen}
        onOpenChange={onClose}
        onExitComplete={onClose}
      >
        <DialogContent minH="524px" minW="568px" marginTop="10%">
          <DialogHeader
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
          </DialogHeader>
          <DialogCloseTrigger marginTop="10px" />
          <DialogBody paddingTop="24px" px="48px">
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
              letterSpacing="widest"
              textTransform="uppercase"
              fontWeight="semibold"
              fontSize="button.md"
              type="submit"
              disabled={isLoading}
              onClick={handleSubmit(onSubmit)}
              p={0}
              m={0}
            >
              {t("save-changes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </>
  );
};

export default UpdateUserDialog;
