import React from "react";
import { MdPersonAdd } from "react-icons/md";
import AddCollaboratorsModal from "./AddCollaboratorModal/AddCollaboratorsModal";
import { useDisclosure } from "@chakra-ui/react";
import { useTranslation } from "@/i18n/client";
import ToolbarActionButton from "./ToolbarActionButton";

export function AddCollaboratorButton({
  lng,
  organizationId,
}: {
  lng: string;
  organizationId?: string;
}) {
  const {
    open: isModalOpen,
    onOpen: onModalOpen,
    onClose: onModalClose,
  } = useDisclosure();
  const { t } = useTranslation(lng, "dashboard");
  return (
    <>
      <AddCollaboratorsModal
        lng={lng}
        isOpen={isModalOpen}
        onClose={onModalClose}
        onOpen={onModalOpen}
        organizationId={organizationId}
      />
      <ToolbarActionButton
        onClick={onModalOpen}
        icon={<MdPersonAdd size={24} />}
        label={t("invite-members")}
        dataTestId="invite-collaborators-button"
      />
    </>
  );
}
