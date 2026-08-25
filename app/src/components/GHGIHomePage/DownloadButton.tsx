import React from "react";
import { Box, useDisclosure } from "@chakra-ui/react";
import { FiDownload } from "react-icons/fi";
import ModalDownloadReport from "./DownloadAndShareModals/ModalDownloadReport";
import ModalPublish from "./DownloadAndShareModals/ModalPublish";
import ToolbarActionButton from "./ToolbarActionButton";
import { useTranslation } from "@/i18n/client";
import type { CityAttributes } from "@/models/City";
import type { InventoryResponse } from "@/util/types";

interface DownloadButtonProps {
  inventoryId: string;
  city?: CityAttributes;
  inventory?: InventoryResponse;
  lng: string;
  children?: React.ReactNode;
}

const DownloadButton: React.FC<DownloadButtonProps> = ({
  inventoryId,
  city,
  lng,
  inventory,
  children,
}) => {
  const {
    open: isDownloadShareOpen,
    onOpen: onDownloadShareOpen,
    onClose: onDownloadShareClose,
  } = useDisclosure();

  const {
    open: isPublishOpen,
    onOpen: onPublishOpen,
    onClose: onPublishClose,
  } = useDisclosure();

  const { t } = useTranslation(lng, "dashboard");

  return (
    <>
      <ModalDownloadReport
        t={t}
        lng={lng}
        isDownloadShareOpen={isDownloadShareOpen}
        onDownloadShareClose={onDownloadShareClose}
        onPublishOpen={onPublishOpen}
        inventoryId={inventoryId}
        inventory={inventory}
        cityLocode={city?.locode}
      />
      <ModalPublish
        // Todo: add close state action
        setModalOpen={() => {}}
        t={t}
        isPublishOpen={isPublishOpen}
        onPublishClose={onPublishClose}
        inventoryId={inventoryId}
        inventory={inventory}
      />
      {children ? (
        <Box onClick={onDownloadShareOpen} data-testid="download-button">
          {children}
        </Box>
      ) : (
        <div data-testid="download-action-card">
          <ToolbarActionButton
            onClick={onDownloadShareOpen}
            icon={<FiDownload size={24} />}
            label={t("download-inventory")}
            dataTestId="download-and-report-button"
          />
        </div>
      )}
    </>
  );
};

export default DownloadButton;
