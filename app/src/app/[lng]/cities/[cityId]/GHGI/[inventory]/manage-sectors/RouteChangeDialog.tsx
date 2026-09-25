"use client";

import { Button } from "@/components/ui/button";
import { CloseButton } from "@/components/ui/close-button";
import { Box, Dialog, Icon, Portal, Text } from "@chakra-ui/react";
import { TFunction } from "i18next";
import React, { FC } from "react";
import { PiWarningCircleFill } from "react-icons/pi";

interface RouteChangeDialogProps {
  showDialog: boolean;
  isSaving?: boolean;
  t: TFunction;
  onSave: () => void;
  onDiscard: () => void;
  onStay: () => void;
}

const RouteChangeDialog: FC<RouteChangeDialogProps> = ({
  t,
  showDialog,
  isSaving = false,
  onSave,
  onDiscard,
  onStay,
}) => {
  return (
    <Dialog.Root
      lazyMount
      open={showDialog}
      onOpenChange={(e) => {
        if (!e.open) onStay();
      }}
      placement="center"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content p="xl" gap="l">
            <Dialog.Header p={0}>
              <Dialog.Title
                textAlign="center"
                fontWeight="bold"
                fontFamily="heading"
                fontSize="headline.sm"
              >
                {t("unsaved-changes-title")}
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body p={0}>
              <Box
                display="flex"
                justifyContent="center"
                alignItems="center"
                mx="auto"
                mb="24px"
                mt="48px"
                h="68px"
                w="68px"
                rounded="30px"
                bg="sentiment.warningOverlay"
              >
                <Icon
                  as={PiWarningCircleFill}
                  color="sentiment.warningDefault"
                  boxSize={12}
                />
              </Box>
              <Text
                textAlign="center"
                fontSize="body.lg"
                fontWeight="400"
                letterSpacing="wide"
              >
                {t("unsaved-changes-leave-description")}
              </Text>
            </Dialog.Body>
            <Dialog.Footer p={0} flexDirection="column" gap="12px">
              <Button
                variant="solid"
                w="full"
                py="24px"
                onClick={onSave}
                loading={isSaving}
              >
                {t("save-and-leave")}
              </Button>
              <Button
                variant="outline"
                w="full"
                py="24px"
                onClick={onDiscard}
                disabled={isSaving}
              >
                {t("discard-changes")}
              </Button>
              <Button
                variant="ghost"
                w="full"
                py="24px"
                onClick={onStay}
                disabled={isSaving}
              >
                {t("keep-editing")}
              </Button>
            </Dialog.Footer>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
};

export default RouteChangeDialog;
