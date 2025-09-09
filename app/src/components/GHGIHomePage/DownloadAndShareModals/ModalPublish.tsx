import { Box, Button, HStack, Image, Text } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import i18next from "i18next";
import { api } from "@/services/api";
import { useState } from "react";
import { UnpublishedView } from "@/components/GHGIHomePage/DownloadAndShareModals/UnpublishedView";
import { PublishedView } from "@/components/GHGIHomePage/DownloadAndShareModals/PublishedView";
import { InventoryResponse } from "@/util/types";
import { trackEvent } from "@/lib/analytics";
import { toaster } from "@/components/ui/toaster";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

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
  const { copyToClipboard } = useCopyToClipboard({});

  const [changePublishStatus, { isLoading: updateLoading }] =
    api.useUpdateInventoryMutation();
  const handlePublishChange = async () => {
    const isPublishing = !inventory?.isPublic;

    try {
      const result = await changePublishStatus({
        inventoryId: inventoryId!,
        data: { isPublic: isPublishing },
      });

      if (result.data) {
        // Track publish/unpublish action
        trackEvent(
          isPublishing ? "inventory_published" : "inventory_unpublished",
          {
            inventory_id: inventoryId,
            inventory_year: inventory.year,
            city_name: inventory.city?.name,
            city_locode: inventory.city?.locode,
          },
        );

        if (isPublishing) {
          // Copy public URL to clipboard when publishing
          const publicUrl = `${window.location.protocol}//${window.location.host}/${i18next.language}/public/${inventoryId}`;
          copyToClipboard(publicUrl);
          
          // Show success toast with clipboard message
          toaster.success({
            title: t("publish-success-title"),
            description: t("link-copied-to-clipboard"),
            duration: 5000,
          });
        } else {
          // Show success toast for unpublishing
          toaster.success({
            title: t("unpublish-success-title"),
            description: t("unpublish-success-description"),
            duration: 5000,
          });
        }

        // Clear internal state and close modal
        setIsAuthorized(false);
        onPublishClose();
      } else if (result.error) {
        // Show error toast for API errors
        toaster.error({
          title: t(isPublishing ? "publish-error-title" : "unpublish-error-title"),
          description: t(isPublishing ? "publish-error-description" : "unpublish-error-description"),
        });
      }

      return result;
    } catch (error) {
      // Show error toast for unexpected errors
      toaster.error({
        title: t(isPublishing ? "publish-error-title" : "unpublish-error-title"),
        description: t(isPublishing ? "publish-error-description" : "unpublish-error-description"),
      });
      throw error;
    }
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
          {!inventory?.isPublic ? (
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
              disabled={!inventory?.isPublic && !isAuthorized}
              colorScheme="blue"
              mr={3}
              loading={updateLoading}
              onClick={handlePublishChange}
            >
              {inventory?.isPublic ? t("unpublish") : t("publish-to-web")}
            </Button>
          </Box>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};

export default ModalPublish;
