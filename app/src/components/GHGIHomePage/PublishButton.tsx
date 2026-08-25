import React from "react";
import { useDisclosure } from "@chakra-ui/react";
import { FiUpload } from "react-icons/fi";
import ModalPublish from "./DownloadAndShareModals/ModalPublish";
import ToolbarActionButton from "./ToolbarActionButton";
import { useTranslation } from "@/i18n/client";
import type { InventoryResponse } from "@/util/types";

export function PublishButton({
  lng,
  inventoryId,
  inventory,
}: {
  lng: string;
  inventoryId: string;
  inventory?: InventoryResponse;
}) {
  const {
    open: isPublishOpen,
    onOpen: onPublishOpen,
    onClose: onPublishClose,
  } = useDisclosure();
  const { t } = useTranslation(lng, "dashboard");

  return (
    <>
      <ModalPublish
        setModalOpen={() => {}}
        t={t}
        isPublishOpen={isPublishOpen}
        onPublishClose={onPublishClose}
        inventoryId={inventoryId}
        inventory={inventory}
      />
      <ToolbarActionButton
        onClick={onPublishOpen}
        icon={<FiUpload size={24} />}
        label={t("publish-inventory")}
        dataTestId="publish-inventory-button"
      />
    </>
  );
}
