import {
  Center,
  Divider,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Text,
} from "@chakra-ui/react";
import type { TFunction } from "i18next";
import React from "react";
import DownloadButtons from "./DownloadButtons";
import ModalPublishButtons from "./PublishButtons";
import { InventoryResponse } from "@/util/types";

const ModalDownloadShare = ({
  t,
  lng,
  isDownloadShareOpen,
  onDownloadShareClose,
  inventoryId,
  cityLocode,
  onPublishOpen,
  inventory,
}: {
  t: TFunction;
  lng: string;
  isDownloadShareOpen: boolean;
  onDownloadShareClose: () => void;
  inventoryId: string | undefined;
  cityLocode: string | undefined;
  onPublishOpen: () => void;
  inventory: InventoryResponse;
}) => {
  return (
    <Modal isOpen={isDownloadShareOpen} onClose={onDownloadShareClose}>
      <ModalOverlay />
      <ModalContent maxW="container.md">
        <ModalHeader>
          <Center>
            <Text fontSize="headline.sm" mx="8px">
              {t("download-and-share")}
            </Text>
          </Center>
        </ModalHeader>
        <ModalCloseButton />
        <Divider my="24px" />
        <ModalBody>
          <DownloadButtons
            t={t}
            lng={lng}
            inventoryId={inventoryId}
            cityLocode={cityLocode}
            inventoryYear={inventory.year}
          />
          <Divider my="12px" />
          <ModalPublishButtons
            t={t}
            onClose={onDownloadShareClose}
            onPublishOpen={onPublishOpen}
          />
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default ModalDownloadShare;
