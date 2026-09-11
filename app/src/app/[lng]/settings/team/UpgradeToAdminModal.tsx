import { TFunction } from "i18next";
import { ProjectUserResponse } from "@/util/types";
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
} from "@/components/ui/dialog";
import { Text } from "@chakra-ui/react";
import { Button } from "@/components/ui/button";
import { api } from "@/services/api";
import { Trans } from "react-i18next/TransWithoutContext";
import { UseErrorToast, UseSuccessToast } from "@/hooks/Toasts";

interface UpgradeToAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  t: TFunction;
  onOpenChange: (val: boolean) => void;
  user: ProjectUserResponse | null;
  organizationId?: string;
  projectName?: string;
}

const UpgradeToAdminModal = (props: UpgradeToAdminModalProps) => {
  const {
    onClose,
    t,
    isOpen,
    onOpenChange,
    user,
    organizationId,
    projectName,
  } = props;

  const { showErrorToast } = UseErrorToast({
    title: t("error-message"),
  });
  const { showSuccessToast } = UseSuccessToast({
    title: t("user-upgraded-to-admin"),
    duration: 1200,
  });

  const [updateUserRole, { isLoading }] =
    api.useUpdateUserRoleInOrganizationMutation();

  const userName = user?.name?.trim() || user?.email?.split("@")[0] || "";

  const handleUpgrade = async () => {
    const response = await updateUserRole({
      organizationId: organizationId as string,
      contactEmail: user?.email as string,
    });

    if (response?.error) {
      showErrorToast();
      return;
    }

    showSuccessToast();
    onClose();
  };

  return (
    <DialogRoot
      preventScroll
      open={isOpen}
      onOpenChange={(e: { open: boolean }) => {
        onOpenChange(e.open);
        if (!e.open) {
          onClose();
        }
      }}
      onExitComplete={onClose}
      placement="center"
    >
      <DialogContent minW="568px" borderRadius="6px">
        <DialogHeader
          display="flex"
          justifyContent="start"
          fontWeight="semibold"
          fontSize="title.lg"
          fontFamily="heading"
          lineHeight="32"
          color="content.primary"
          padding="6"
          paddingBottom="4"
        >
          {t("upgrade-member-to-admin-title")}
        </DialogHeader>
        <DialogCloseTrigger
          mt="2"
          color="interactive.control"
          top="-6px"
          right="0"
        />
        <DialogBody paddingX="6" paddingBottom="6" paddingTop="0">
          <Text fontSize="body.lg" color="content.tertiary" lineHeight="24">
            <Trans
              i18nKey="confirm-upgrade-to-admin"
              t={t}
              values={{
                userName,
                projectName,
              }}
              components={{
                bold: (
                  <Text
                    as="span"
                    fontWeight="semibold"
                    color="content.primary"
                  />
                ),
              }}
            />
          </Text>
        </DialogBody>
        <DialogFooter
          paddingX="6"
          paddingY="6"
          paddingTop="0"
          display="flex"
          justifyContent="flex-end"
          gap="4"
        >
          <Button
            variant="ghost"
            h="48px"
            minW="120px"
            onClick={onClose}
            textTransform="uppercase"
            letterSpacing="wider"
            fontWeight="semibold"
            fontSize="button.md"
            color="content.secondary"
          >
            {t("cancel")}
          </Button>
          <Button
            variant="solid"
            h="48px"
            minW="200px"
            onClick={handleUpgrade}
            loading={isLoading}
            textTransform="uppercase"
            letterSpacing="wider"
            fontWeight="semibold"
            fontSize="button.md"
          >
            {t("upgrade-to-admin")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};

export default UpgradeToAdminModal;
