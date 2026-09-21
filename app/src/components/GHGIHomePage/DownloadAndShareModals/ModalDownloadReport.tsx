import { Center, Separator, Text } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import DownloadButtons from "./DownloadButtons";
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
  inventory,
}: {
  t: TFunction;
  lng: string;
  isDownloadShareOpen: boolean;
  onDownloadShareClose: () => void;
  inventoryId: string | undefined;
  cityLocode: string | undefined;
  inventory?: InventoryResponse;
}) => {
  return (
    <DialogRoot
      open={isDownloadShareOpen}
      onOpenChange={onDownloadShareClose}
      onInteractOutside={onDownloadShareClose}
      placement="center"
    >
      <DialogContent minW="544px">
        <DialogHeader>
          <Center>
            <Text
              color="fg"
              fontFamily="body"
              fontSize="lg"
              fontWeight="semibold"
              lineHeight="28"
              data-testid="download-modal-title"
            >
              {t("download-inventory")}
            </Text>
          </Center>
        </DialogHeader>
        <DialogCloseTrigger />
        <Separator borderColor="border.overlay" mt={0} mb="l" />
        <DialogBody px={0} py={0}>
          <DownloadButtons
            t={t}
            lng={lng}
            inventoryId={inventoryId}
            cityLocode={cityLocode}
            inventoryYear={inventory?.year}
            onClose={onDownloadShareClose}
          />
        </DialogBody>
      </DialogContent>
    </DialogRoot>
  );
};

export default ModalDownloadReport;
