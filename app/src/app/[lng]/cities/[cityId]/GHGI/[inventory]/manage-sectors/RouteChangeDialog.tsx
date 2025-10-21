"use client";

import { Button } from "@/components/ui/button";
import { CloseButton } from "@/components/ui/close-button";
import { Box, Dialog, Icon, Portal, Text } from "@chakra-ui/react";
import { TFunction } from "i18next";
import React, { FC } from "react";
import {
  PiWarningCircle,
  PiWarningCircleBold,
  PiWarningCircleFill,
} from "react-icons/pi";

interface RouteChangeDialogProps {
  showDialog: boolean;
  setShowDialog: (showDialog: boolean) => void;
  t: TFunction;
  confirmNavigation: () => void;
  cancelNavigation: () => void;
}

const RouteChangeDialog: FC<RouteChangeDialogProps> = ({
  t,
  showDialog,
  setShowDialog,
  cancelNavigation,
  confirmNavigation,
}) => {
  return (
    <Dialog.Root
      lazyMount
      open={showDialog}
      onOpenChange={(e) => setShowDialog(e.open)}
      placement="center"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title
                textAlign="center"
                fontWeight="bold"
                fontFamily="heading"
                fontSize="headline.sm"
              >
                {t("changes-can-be-lost")}
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
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
                {t("changes-can-be-lost-description")}
              </Text>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.ActionTrigger asChild>
                <Button
                  variant="outline"
                  display="flex"
                  flex="1"
                  py="24px"
                  onClick={confirmNavigation}
                >
                  {t("discard-changes")}
                </Button>
              </Dialog.ActionTrigger>
              <Dialog.ActionTrigger asChild>
                <Button
                  display="flex"
                  variant="solid"
                  flex="1"
                  py="24px"
                  onClick={cancelNavigation}
                >
                  {t("keep-editing")}
                </Button>
              </Dialog.ActionTrigger>
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
