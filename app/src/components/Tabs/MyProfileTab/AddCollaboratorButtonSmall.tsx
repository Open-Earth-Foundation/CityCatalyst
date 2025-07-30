import React from "react";
import { MdPersonAdd } from "react-icons/md";
import { Button, useDisclosure } from "@chakra-ui/react";
import AddCollaboratorsModal from "@/components/GHGIHomePage/AddCollaboratorModal/AddCollaboratorsModal";
import { ButtonMedium } from "@/components/Texts/Button";
import { useTranslation } from "@/i18n/client";

export function AddCollaboratorButtonSmall({ lng }: { lng: string }) {
  const { t } = useTranslation(lng, "settings");
  const {
    open: isModalOpen,
    onOpen: onModalOpen,
    onClose: onModalClose,
  } = useDisclosure();

  return (
    <>
      <AddCollaboratorsModal
        lng={lng}
        isOpen={isModalOpen}
        onClose={onModalClose}
        onOpen={onModalOpen}
      />
      <Button
        onClick={onModalOpen}
        aria-label={t("invite-collaborators")}
        color={"interactive.secondary"}
        padding={4}
      >
        <MdPersonAdd color="white" size={24} />
        <ButtonMedium color="background.default" marginLeft={2}>
          {t("invite")}
        </ButtonMedium>
      </Button>
    </>
  );
}
