import React from "react";
import { useDisclosure } from "@chakra-ui/react";
import { FiDownload } from "react-icons/fi";
import type { TFunction } from "i18next";
import ModalDownloadReport from "./DownloadAndShareModals/ModalDownloadReport";
import ModalPublish from "./DownloadAndShareModals/ModalPublish";
import ActionCardSmall from "./ActionCardSmall";

interface DownloadButtonProps {
  inventoryId: string;
  city: any;
  inventory: any;
  lng: string;
  t: TFunction;
}

const DownloadButton: React.FC<DownloadButtonProps> = ({
  inventoryId,
  city,
  lng,
  inventory,
  t,
}) => {
  const {
    isOpen: isDownloadShareOpen,
    onOpen: onDownloadShareOpen,
    onClose: onDownloadShareClose,
  } = useDisclosure();

  const {
    isOpen: isPublishOpen,
    onOpen: onPublishOpen,
    onClose: onPublishClose,
  } = useDisclosure();

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
        t={t}
        isPublishOpen={isPublishOpen}
        onPublishClose={onPublishClose}
        inventoryId={inventoryId}
        inventory={inventory}
      />
      <ActionCardSmall
        onClick={onDownloadShareOpen}
        icon={<FiDownload className="text-white" size={24} />}
        title={t("download-and-report")}
      />
    </>
  );
};

export default DownloadButton;
