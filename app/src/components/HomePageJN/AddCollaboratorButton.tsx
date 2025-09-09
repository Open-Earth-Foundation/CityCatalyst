import React from "react";
import AddCollaboratorsModal from "../GHGIHomePage/AddCollaboratorModal/AddCollaboratorsModal";
import { useDisclosure } from "@chakra-ui/react";
import { useTranslation } from "@/i18n/client";
import ActionCardSmall from "./ActionCardSmall";
import { AddCollaboratorIcon } from "../icons";

export function AddCollaboratorButton({ lng }: { lng: string }) {
  const {
    open: isModalOpen,
    setOpen: setIsModalOpen,
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
        icon={<AddCollaboratorIcon />}
        title={t("invite-collaborators")}
        color="interactive.primary"
      />
    </>
  );
}
