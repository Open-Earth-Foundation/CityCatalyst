import {
  Box,
  Card,
  CardBody,
  CardHeader,
  Text,
  useDisclosure,
} from "@chakra-ui/react";
import { FiDownload } from "react-icons/fi";
import { Trans } from "react-i18next/TransWithoutContext";
import type { TFunction } from "i18next";
import ModalDownloadShare from "./DownloadAndShareModals/ModalDownloadShare";
import ModalPublish from "./DownloadAndShareModals/ModalPublish";

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
    <Card
      onClick={onDownloadShareOpen}
      shadow="2dp"
      backgroundColor="base.light"
      className="h-[132px] hover:shadow-xl"
      py={0}
      px={6}
    >
      <ModalDownloadShare
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
      <Box className="flex items-center w-fill">
        <Box>
          <Box className="flex items-center justify-center h-[48px] w-[48px] rounded-full bg-[#2351DC]">
            <FiDownload className="text-white" size={24} />
          </Box>
        </Box>
        <Box>
          <CardHeader className="flex h-[20px] gap-2">
            <Text
              fontFamily="heading"
              fontSize="title.lg"
              color="interactive.secondary"
              fontWeight="semibold"
            >
              {t("download-and-share")}
            </Text>
          </CardHeader>
          <CardBody className="h-[75px]">
            <Text
              fontSize="body.lg"
              color="body"
              lineHeight="24"
              letterSpacing="wide"
            >
              <Trans t={t}>download-description</Trans>
            </Text>
          </CardBody>
        </Box>
      </Box>
    </Card>
  );
};

export default DownloadButton;
