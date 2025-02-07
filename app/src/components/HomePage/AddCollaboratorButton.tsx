import React from "react";
import { MdPersonAdd } from "react-icons/md";
import AddCollaboratorsModal from "./AddCollaboratorModal/AddCollaboratorsModal";
import { useDisclosure } from "@chakra-ui/react";
import { useTranslation } from "@/i18n/client";
import ActionCardSmall from "./ActionCardSmall";

export function AddCollaboratorButton({ lng }: { lng: string }) {
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
      />
      <ActionCardSmall
        onClick={onModalOpen}
        icon={<MdPersonAdd className="text-white" size={24} />}
        title={t("invite-collaborators")}
      />
    </>
  );
}
