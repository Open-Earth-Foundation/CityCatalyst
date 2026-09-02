import { Box, Button, HStack, Separator, Text } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import i18next from "i18next";
import { api } from "@/services/api";
import { UnpublishedView } from "@/components/GHGIHomePage/DownloadAndShareModals/UnpublishedView";
import { PublishedView } from "@/components/GHGIHomePage/DownloadAndShareModals/PublishedView";
import { trackEvent } from "@/lib/analytics";
import { toaster } from "@/components/ui/toaster";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogCloseTrigger,
} from "@/components/ui/dialog";
import type { InventoryResponse } from "@/util/types";

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
  inventory?: InventoryResponse;
  setModalOpen: (open: boolean) => void;
}) => {
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
            inventory_year: inventory?.year,
            city_name: inventory?.city?.name,
            city_locode: inventory?.city?.locode,
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

        onPublishClose();
      } else if (result.error) {
        // Show error toast for API errors
        toaster.error({
          title: t(
            isPublishing ? "publish-error-title" : "unpublish-error-title",
          ),
          description: t(
            isPublishing
              ? "publish-error-description"
              : "unpublish-error-description",
          ),
        });
      }

      return result;
    } catch (error) {
      // Show error toast for unexpected errors
      toaster.error({
        title: t(
          isPublishing ? "publish-error-title" : "unpublish-error-title",
        ),
        description: t(
          isPublishing
            ? "publish-error-description"
            : "unpublish-error-description",
        ),
      });
      throw error;
    }
  };

  return (
    <DialogRoot
      open={isPublishOpen}
      onOpenChange={(e) => setModalOpen(e.open)}
      onInteractOutside={onPublishClose}
      placement="center"
    >
      <DialogContent width="448px" maxW="448px">
        <DialogHeader>
          <Text
            color="fg"
            fontFamily="body"
            fontSize="lg"
            fontWeight="semibold"
            lineHeight="28"
          >
            {inventory?.isPublic
              ? t("published-inventory")
              : t("publish-to-web")}
          </Text>
        </DialogHeader>
        <DialogCloseTrigger onClick={onPublishClose} />

        <DialogBody>
          <Box my="24px" divideX="2px" />
          {!inventory?.isPublic ? (
            <UnpublishedView t={t} />
          ) : (
            <PublishedView
              t={t}
              inventoryId={inventoryId}
              inventory={inventory}
            />
          )}
        </DialogBody>
        <Separator borderColor="border.overlay" />
        <DialogFooter>
          <HStack gap={3}>
            <Button
              variant="outline"
              onClick={onPublishClose}
              borderRadius="pill"
              border="1px solid"
              borderColor="gray.muted"
            >
              <Text
                color="#27272A"
                textAlign="center"
                fontFamily="heading"
                fontSize="button.md"
                fontWeight="semibold"
                lineHeight="16"
                letterSpacing="wider"
                textTransform="uppercase"
              >
                {t("cancel")}
              </Text>
            </Button>
            <Button
              bg={inventory?.isPublic ? "sentiment.negativeDefault" : undefined}
              colorScheme={inventory?.isPublic ? undefined : "blue"}
              loading={updateLoading}
              onClick={handlePublishChange}
            >
              {inventory?.isPublic ? t("unpublish") : t("publish")}
            </Button>
          </HStack>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};

export default ModalPublish;
