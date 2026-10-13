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

// Beyond this many failed emails the toast shows a count instead of a list.
const MAX_LISTED_EMAILS = 3;

const AddCollaboratorsDialog = ({
  lng,
  isOpen,
  onClose,
  organizationId,
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
      const result = await stepRef.current?.sendInvites();
      const emailFailures = result?.emailFailures ?? [];
      if (emailFailures.length) {
        const failureDescription =
          emailFailures.length <= MAX_LISTED_EMAILS
            ? t("invite-email-failed-toast-description", {
                emails: emailFailures.join(", "),
                interpolation: { escapeValue: false },
              })
            : t("invite-email-failed-toast-description-many", {
                count: emailFailures.length,
              });
        toaster.create({
          title: t("invite-email-failed-toast-title"),
          description: result?.copied
            ? `${failureDescription} ${t("invite-link-in-clipboard")}`
            : failureDescription,
          type: "warning",
          duration: 8000,
        });
      } else {
        toaster.create({
          title: t("invite-success-toast-title"),
          description: t("invite-link-copied-to-clipboard"),
          type: "success",
          duration: 3000,
        });
      }
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
        display="flex"
        flexDirection="column"
        alignItems="center"
        gap="24px"
        minW="779px"
        maxH="calc(100vh - 56px * 2)"
        overflowY="auto"
        py="24px"
      >
        <DialogHeader
          w="full"
          display="flex"
          justifyContent="start"
          fontWeight="semibold"
          fontSize="headline.sm"
          fontFamily="heading"
          lineHeight="32"
          color="base.dark"
          px="48px"
          borderBottomWidth="2px"
          borderStyle="solid"
          borderColor="background.neutral"
          pt={0}
          pb={6}
        >
          <HStack w="full" justifyContent="space-between">
            <TitleLarge>{tSettings("invite-collaborators-title")}</TitleLarge>
            {/* Static inside the header so it stays vertically centred on the title */}
            <DialogCloseTrigger position="static" color="interactive.control" />
          </HStack>
        </DialogHeader>
        <DialogBody w="full" px={12} py={0}>
          <InviteCollaboratorsStep
            ref={stepRef}
            lng={lng}
            onValidityChange={setCanSubmit}
            organizationId={organizationId}
            variant="modal"
          />
        </DialogBody>
        <DialogFooter
          w="full"
          px={12}
          pt={6}
          pb={0}
          gap={6}
          borderTop="2px"
          borderColor="background.neutral"
          borderStyle="solid"
        >
          <Button variant="outline" onClick={onClose} h="auto" px="l" py="m">
            <Text fontFamily="button.md" fontWeight="600" letterSpacing="wider">
              {t("cancel")}
            </Text>
          </Button>
          <Button
            onClick={handleSend}
            disabled={!canSubmit}
            h="auto"
            px="l"
            py="m"
          >
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
