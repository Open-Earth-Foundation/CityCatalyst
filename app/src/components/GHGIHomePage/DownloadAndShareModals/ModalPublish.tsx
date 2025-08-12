import { Box, Button, HStack, Image, Text } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { api } from "@/services/api";
import { useState } from "react";
import { UnpublishedView } from "@/components/GHGIHomePage/DownloadAndShareModals/UnpublishedView";
import { PublishedView } from "@/components/GHGIHomePage/DownloadAndShareModals/PublishedView";
import { InventoryResponse } from "@/util/types";
import { trackEvent } from "@/lib/analytics";

import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";

const ModalPublish = ({
  t,
  isPublishOpen,
  onPublishClose,
  inventoryId,
  inventory,
  setModalOpen,
}: {
  t: TFunction;
  isPublishOpen: boolean;
  onPublishClose: () => void;
  inventoryId: string;
  inventory: InventoryResponse;
  setModalOpen: (open: boolean) => void;
}) => {
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);

  const [changePublishStatus, { isLoading: updateLoading }] =
    api.useUpdateInventoryMutation();
  const handlePublishChange = async () => {
    const isPublishing = !inventory.isPublic;
    
    const result = await changePublishStatus({
      inventoryId: inventoryId!,
      data: { isPublic: isPublishing },
    });
    
    // Track publish/unpublish action
    if (result.data) {
      trackEvent(isPublishing ? "inventory_published" : "inventory_unpublished", {
        inventory_id: inventoryId,
        inventory_year: inventory.year,
        city_name: inventory.city?.name,
        city_locode: inventory.city?.locode,
      });
    }
    
    return result;
  };

  return (
    <DialogRoot
      open={isPublishOpen}
      onOpenChange={(e) => setModalOpen(e.open)}
      onInteractOutside={onPublishClose}
    >
      <DialogContent maxW="container.md">
        <DialogHeader>
          <HStack>
            <Image
              src="/assets/publish.svg"
              alt="publish-to-web"
              width="24px"
              height="24px"
            />
            <Text fontSize="headline.sm" mx="8px">
              {t("publish-to-web")}
            </Text>
          </HStack>
        </DialogHeader>

        <DialogBody>
          <Box my="24px" divideX="2px" />
          {!inventory.isPublic ? (
            <UnpublishedView
              t={t}
              checked={isAuthorized}
              onAuthorizeChange={() =>
                setIsAuthorized((isAuth: boolean) => !isAuth)
              }
            />
          ) : (
            <PublishedView
              t={t}
              inventoryId={inventoryId}
              inventory={inventory}
            />
          )}
        </DialogBody>
        <DialogFooter>
          <Box>
            <Button
              disabled={!inventory.isPublic && !isAuthorized}
              colorScheme="blue"
              mr={3}
              onClick={handlePublishChange}
            >
              {inventory.isPublic ? t("unpublish") : t("publish-to-web")}
            </Button>
          </Box>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};

export default ModalPublish;
