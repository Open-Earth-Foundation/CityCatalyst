import React from "react";
import { MdPersonAdd } from "react-icons/md";
import AddCollaboratorsModal from "./AddCollaboratorModal/AddCollaboratorsModal";
import { useDisclosure } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import ActionCardSmall from "./ActionCardSmall";

export function AddCollaboratorButton({ t }: { t: TFunction }) {
  const {
    isOpen: isModalOpen,
    onOpen: onModalOpen,
    onClose: onModalClose,
  } = useDisclosure();

  return (
    <>
      <AddCollaboratorsModal
        t={t}
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
