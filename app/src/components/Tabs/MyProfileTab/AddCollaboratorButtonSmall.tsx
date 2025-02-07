import React from "react";
import { MdPersonAdd } from "react-icons/md";
import { Button, HStack, IconButton, useDisclosure } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import AddCollaboratorsModal from "@/components/HomePage/AddCollaboratorModal/AddCollaboratorsModal";
import { ButtonMedium } from "@/components/Texts/Button";
import { useTranslation } from "@/i18n/client";

export function AddCollaboratorButtonSmall({ lng }: { lng: string }) {
  const { t } = useTranslation(lng, "settings");
  const {
    isOpen: isModalOpen,
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
        <MdPersonAdd className="text-white" size={24} />
        <ButtonMedium textColor={"background.default"} marginLeft={2}>
          {t("invite")}
        </ButtonMedium>
      </Button>
    </>
  );
}
