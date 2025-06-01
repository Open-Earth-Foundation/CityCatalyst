import React from "react";
import { Card, useDisclosure } from "@chakra-ui/react";
import { FiDownload } from "react-icons/fi";
import type { TFunction } from "i18next";
import ModalDownloadReport from "./DownloadAndShareModals/ModalDownloadReport";
import ModalPublish from "./DownloadAndShareModals/ModalPublish";
import ActionCardSmall from "./ActionCardSmall";
import { useTranslation } from "@/i18n/client";

interface DownloadButtonProps {
  inventoryId: string;
  city: any;
  inventory: any;
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
        <button onClick={onDownloadShareOpen}>{children}</button>
      ) : (
        <ActionCardSmall
          onClick={onDownloadShareOpen}
          icon={<FiDownload className="text-white" size={24} />}
          title={t("download-and-report")}
        />
      )}
    </>
  );
};

export default DownloadButton;
