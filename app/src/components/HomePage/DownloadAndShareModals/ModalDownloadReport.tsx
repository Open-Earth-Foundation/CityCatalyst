import { Box, Center, Text } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import React from "react";
import DownloadButtons from "./DownloadButtons";
import ModalPublishButtons from "./PublishButtons";
import { InventoryResponse } from "@/util/types";

import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogRoot,
} from "@/components/ui/dialog";

const ModalDownloadReport = ({
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
    <DialogRoot
      open={isDownloadShareOpen}
      onOpenChange={onDownloadShareClose}
      onInteractOutside={onDownloadShareClose}
    >
      <DialogContent minW="544px">
        <DialogHeader>
          <Center>
            <Text fontSize="headline.sm" mx="8px">
              {t("download-and-share")}
            </Text>
          </Center>
        </DialogHeader>
        <DialogCloseTrigger />
        <Box divideX="2px" my="24px" />
        <DialogBody px={0}>
          <DownloadButtons
            t={t}
            lng={lng}
            inventoryId={inventoryId}
            cityLocode={cityLocode}
            inventoryYear={inventory.year}
          />
          <Box divideX="2px" my="12px" />
          <ModalPublishButtons
            t={t}
            onClose={onDownloadShareClose}
            onPublishOpen={onPublishOpen}
          />
        </DialogBody>
      </DialogContent>
    </DialogRoot>
  );
};

export default ModalDownloadReport;
