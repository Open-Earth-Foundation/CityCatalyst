"use client";

import { useRef, useState } from "react";
import { useTranslation } from "@/i18n/client";
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HStack, Text } from "@chakra-ui/react";
import InviteCollaboratorsStep, {
  type InviteCollaboratorsStepRef,
} from "@/components/steps/GHGI/invite-collaborators-step";
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";
import { TitleLarge } from "@/components/package";
import { toaster } from "@/components/ui/toaster";

const AddCollaboratorsDialog = ({
  lng,
  isOpen,
  onClose,
}: {
  lng: string;
  isOpen: boolean;
  onClose: () => void;
  onOpen?: () => void;
  organizationId?: string;
}) => {
  const { t } = useTranslation(lng, "dashboard");
  const { t: tSettings } = useTranslation(lng, "settings");
  const stepRef = useRef<InviteCollaboratorsStepRef>(null);
  const [canSubmit, setCanSubmit] = useState(false);

  const { showErrorToast } = UseErrorToast({
    title: t("invite-error-toast-title"),
    description: t("invite-error-toast-description"),
  });

  const handleSend = async () => {
    try {
      await stepRef.current?.sendInvites();
      toaster.create({
        title: t("invite-success-toast-title"),
        description: t("invite-link-copied-to-clipboard"),
        type: "success",
        duration: 3000,
      });
      onClose();
    } catch {
      showErrorToast();
    }
  };

  return (
    <DialogRoot
      open={isOpen}
      onOpenChange={onClose}
      onExitComplete={onClose}
      placement="center"
    >
      <DialogContent
        minW="779px"
        minH="779px"
        overflowY="auto"
        px="48px"
        py="24px"
      >
        <DialogHeader
          display="flex"
          justifyContent="start"
          fontWeight="semibold"
          fontSize="headline.sm"
          fontFamily="heading"
          lineHeight="32"
          color="base.dark"
          padding="24px"
          borderBottomWidth="2px"
          borderStyle="solid"
          borderColor="background.neutral"
          p="0px"
          pb="24px"
        >
          <HStack>
            <TitleLarge>{tSettings("invite-collaborators-title")}</TitleLarge>
          </HStack>
        </DialogHeader>
        <DialogCloseTrigger mt="2" color="interactive.control" mr="4" />
        <DialogBody p="0px" py="24px">
          <InviteCollaboratorsStep
            ref={stepRef}
            lng={lng}
            onValidityChange={setCanSubmit}
          />
        </DialogBody>
        <DialogFooter
          paddingX={6}
          paddingY={6}
          borderTop="2px"
          borderColor="background.neutral"
          borderStyle="solid"
        >
          <Button variant="outline" onClick={onClose}>
            <Text fontFamily="button.md" fontWeight="600" letterSpacing="wider">
              {t("cancel")}
            </Text>
          </Button>
          <Button onClick={handleSend} disabled={!canSubmit}>
            <Text fontFamily="button.md" fontWeight="600" letterSpacing="wider">
              {t("send-invites-action")}
            </Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};

export default AddCollaboratorsDialog;
