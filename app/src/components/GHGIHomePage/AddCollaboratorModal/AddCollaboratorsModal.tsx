"use client";

import { useRef } from "react";
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
import { MdPersonAdd } from "react-icons/md";
import { HeadlineSmall } from "@/components/package/Texts/Headline";
import InviteCollaboratorsStep, {
  type InviteCollaboratorsStepRef,
} from "@/components/steps/GHGI/invite-collaborators-step";
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";

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
  const { t } = useTranslation(lng, "onboarding");
  const { t: tDashboard } = useTranslation(lng, "dashboard");
  const stepRef = useRef<InviteCollaboratorsStepRef>(null);

  const { showSuccessToast } = UseSuccessToast({
    title: tDashboard("invite-success-toast-title"),
    description: tDashboard("invite-success-toast-description"),
  });

  const { showErrorToast } = UseErrorToast({
    title: tDashboard("invite-error-toast-title"),
    description: tDashboard("invite-error-toast-description"),
  });

  const handleSend = async () => {
    try {
      await stepRef.current?.sendInvites();
      showSuccessToast();
      onClose();
    } catch {
      showErrorToast();
    }
  };

  return (
    <DialogRoot open={isOpen} onOpenChange={onClose} onExitComplete={onClose}>
      <DialogContent minW="680px" maxH="90vh" overflowY="auto" marginTop="2%" p={0}>
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
        >
          <HStack>
            <MdPersonAdd fontSize="32px" />
            <HeadlineSmall text={tDashboard("invite-collaborators")} />
          </HStack>
        </DialogHeader>
        <DialogCloseTrigger mt="2" color="interactive.control" mr="2" />
        <DialogBody p={6}>
          <InviteCollaboratorsStep ref={stepRef} t={t} />
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
              {t("skip-this-step")}
            </Text>
          </Button>
          <Button onClick={handleSend}>
            <Text fontFamily="button.md" fontWeight="600" letterSpacing="wider">
              {t("invite-collaborators-step")}
            </Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};

export default AddCollaboratorsDialog;
