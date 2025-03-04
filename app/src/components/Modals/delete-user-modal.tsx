"use client";

import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";
import { api } from "@/services/api";
import { Badge, Box, Button, Text } from "@chakra-ui/react";
import { TFunction } from "i18next";
import React, { FC } from "react";

import { FiTrash2 } from "react-icons/fi";
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
} from "@/components/ui/dialog";

interface DeleteUserDialogProps {
  isOpen: boolean;
  onClose: any;
  cityInviteId: string;
  t: TFunction;
}

const DeleteUserDialog: FC<DeleteUserDialogProps> = ({
  isOpen,
  onClose,
  cityInviteId,
  t,
}) => {
  const [cancelUserInvite, { isLoading, error }] =
    api.useCancelInviteMutation();
  const { showSuccessToast } = UseSuccessToast({
    description: t("invite-canceled"),
    title: t("invite-canceled"),
  });

  const { showErrorToast } = UseErrorToast({
    description: t("invite-cancel-fail"),
    title: t("invite-cancel-fail"),
  });
  const handleCancelInvite = async () => {
    await cancelUserInvite({ cityInviteId }).then(() => {
      onClose();
      if (error) {
        showErrorToast();
      } else {
        showSuccessToast();
      }
    });
  };
  return (
    <>
      <DialogRoot
        preventScroll
        open={isOpen}
        onOpenChange={onClose}
        onExitComplete={onClose}
      >
        <DialogContent minH="388px" minW="568px" marginTop="10%">
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
            {t("remove-user")}
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
                  fontFamily="heading"
                  w="408px"
                  fontSize="body.large"
                  letterSpacing="wide"
                  fontStyle="normal"
                >
                  {t("are-you-sure-you-want-to")}{" "}
                  <span style={{ fontWeight: "bold" }}>{t("un-invite")}</span>{" "}
                  {t("this-user-from-your-city")}
                </Text>
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
              onClick={handleCancelInvite}
              disabled={isLoading}
              p={0}
              m={0}
            >
              {t("remove-user")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </>
  );
};

export default DeleteUserDialog;
