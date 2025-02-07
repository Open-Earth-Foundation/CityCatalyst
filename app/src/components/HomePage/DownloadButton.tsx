import React from "react";
import { Card, useDisclosure } from "@chakra-ui/react";
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
    open: isDownloadShareOpen,
    onOpen: onDownloadShareOpen,
    onClose: onDownloadShareClose,
  } = useDisclosure();

  const {
    open: isPublishOpen,
    onOpen: onPublishOpen,
    onClose: onPublishClose,
  } = useDisclosure();

  return (
    <Card.Root
      onClick={onDownloadShareOpen}
      shadow="2dp"
      backgroundColor="base.light"
      className="h-[132px] hover:shadow-xl"
      py={0}
      px={6}
    >
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
      <ActionCardSmall
        onClick={onDownloadShareOpen}
        icon={<FiDownload className="text-white" size={24} />}
        title={t("download-and-report")}
      />
    </Card.Root>
  );
};

export default DownloadButton;
