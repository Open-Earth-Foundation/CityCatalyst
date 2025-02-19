"use client";

import { UserFileAttributes } from "@/models/UserFile";
import { api } from "@/services/api";
import { Button, Text, Box, Badge } from "@chakra-ui/react";
import { TFunction } from "i18next";
import React, { FC } from "react";
import { Trans } from "react-i18next";

import { FiTrash2 } from "react-icons/fi";

import {
  DialogRoot,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";

interface DeleteFileDialogProps {
  isOpen: boolean;
  onClose: any;
  fileData: UserFileAttributes | undefined;
  t: TFunction;
}

const DeleteFileDialog: FC<DeleteFileDialogProps> = ({
  isOpen,
  onClose,
  fileData,
  t,
}) => {
  const [deleteUserFile] = api.useDeleteUserFileMutation();
  const onDeleteFile = async () => {
    try {
      await deleteUserFile({ fileId: fileData?.id, cityId: fileData?.cityId });
    } catch (error) {
      console.error(error);
    } finally {
      onClose();
    }
  };
  return (
    <DialogRoot open={isOpen} onOpenChange={onClose}>
      <DialogContent minH="388px" minW="568px" marginTop="10%">
        <DialogHeader
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
          {t("delete-file")}
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
                fontFamily="body"
              >
                <Trans t={t} i18nKey="delete-file-prompt">
                  Are you sure you want to{" "}
                  <span style={{ fontWeight: "bold" }}>permanently delete</span>{" "}
                  this file from the city&apos;s repository?
                </Trans>
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
            background="sentiment.negativeDefault"
            paddingTop="16px"
            paddingBottom="16px"
            px="24px"
            letterSpacing="widest"
            textTransform="uppercase"
            fontWeight="semibold"
            fontSize="button.md"
            type="button"
            onClick={() => onDeleteFile()}
            p={0}
            m={0}
          >
            {t("delete-file")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};

export default DeleteFileDialog;
