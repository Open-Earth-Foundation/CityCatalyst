import type { TFunction } from "i18next";
import {
  Badge,
  Box,
  Button,
  Checkbox,
  HStack,
  Separator,
  Text,
  VStack,
} from "@chakra-ui/react";
import React, { useState } from "react";

import { Toaster, toaster } from "@/components/ui/toaster";
import { logger } from "@/services/logger";
import { trackEvent } from "@/lib/analytics";

const DownloadButtons = ({
  t,
  lng,
  inventoryId,
  cityLocode,
  inventoryYear,
  onClose,
}: {
  t: TFunction;
  lng: string;
  inventoryId: string | undefined;
  cityLocode: string | undefined;
  inventoryYear: number | undefined;
  onClose: () => void;
}) => {
  const [selectedFormats, setSelectedFormats] = useState<string[]>([]);

  const toggleFormat = (format: string, checked: boolean) => {
    setSelectedFormats((prev) =>
      checked ? [...prev, format] : prev.filter((f) => f !== format),
    );
  };
  const DOWNLOAD_BUTTONS = {
    // ciris: { isAvailable: false },
    csv: { isAvailable: true },
    ecrf: { isAvailable: true },
    // pdf: { isAvailable: false },
  };

  enum STATUS {
    INFO = "info",
    SUCCESS = "success",
    ERROR = "error",
  }

  const showToast = (
    title: string,
    description: string,
    status: STATUS,
    duration: number | null,
  ) => {
    // Replace previous toast notifications
    if (duration == null) {
      toaster.dismiss();
    }

    toaster.create({
      description: t(description),
      type: status,
      duration: duration!,
      // render: ({
      //   onClose,
      // }: {
      //   onClose: MouseEventHandler<HTMLButtonElement>;
      // }) => (
      //   <Box
      //     display="flex"
      //     gap="8px"
      //     color="white"
      //     alignItems="center"
      //     p={3}
      //     bg={showAnimatedGradient ? undefined : bgColor}
      //     className={showAnimatedGradient ? animatedGradientClass : undefined}
      //     width="600px"
      //     height="60px"
      //     borderRadius="8px"
      //   >
      //     <Box display="flex" gap="8px" alignItems="center">
      //       {status === "info" || status === "error" ? (
      //         <MdInfoOutline fontSize="24px" />
      //       ) : (
      //         <MdCheckCircleOutline fontSize="24px" />
      //       )}
      //       <Text
      //         color="base.light"
      //         fontWeight="bold"
      //         lineHeight="52"
      //         fontSize="label.lg"
      //       >
      //         {t(title)}
      //       </Text>
      //     </Box>
      //     <Spacer />
      //     {status === "error" && (
      //       <Button
      //         variant="lightGhost"
      //         onClick={() => handleDownload("csv")}
      //         fontWeight="600"
      //         fontSize="16px"
      //         letterSpacing="1.25px"
      //       >
      //         {t("try-again")}
      //       </Button>
      //     )}
      //     <CloseButton onClick={onClose} />
      //   </Box>
      // ),
    });
  };

  const handleDownload = (format: string) => {
    showToast(
      "preparing-dataset",
      "wait-fetch-data",
      STATUS.INFO,
      null,
    );
    fetch(
      `/api/v1/inventory/${inventoryId}/download?format=${format}&lng=${lng}`,
    )
      .then((res) => {
        if (!res.ok) {
          throw new Error("Network response was not ok");
        }

        const contentDisposition = res.headers.get("Content-Disposition");
        if (contentDisposition) {
          const match = contentDisposition.match(/filename="(.+)"/);
          const filename = match
            ? match[1]
            : `${cityLocode}_${inventoryYear}.${format}`;
          return res.blob().then((blob) => {
            const downloadLink = document.createElement("a");
            downloadLink.href = URL.createObjectURL(blob);
            downloadLink.download = filename;

            downloadLink.click();

            // Track successful download
            trackEvent("report_downloaded", {
              format,
              inventory_id: inventoryId,
              city_locode: cityLocode,
              inventory_year: inventoryYear,
            });

            showToast(
              "download-complete",
              "downloading-data",
              STATUS.SUCCESS,
              null,
            );
            URL.revokeObjectURL(downloadLink.href);
            downloadLink.remove();
          });
        }
      })
      .catch((error) => {
        logger.error(
          {
            err: error,
            inventoryId,
            format,
            cityLocode,
            inventoryYear
          },
          "Failed to download inventory"
        );
        showToast(
          "download-failed",
          "download-error",
          STATUS.ERROR,
          null,
        );
      });
  };

  const handleConfirmDownload = () => {
    selectedFormats.forEach((format) => handleDownload(format));
    onClose();
  };

  return (
    <Box display="flex" flexDirection="column" pb="l">
      {Object.entries(DOWNLOAD_BUTTONS).map(([format, { isAvailable }], index) => (
        <React.Fragment key={format}>
          {index > 0 && <Separator borderColor="border.overlay" my="l" />}
          <Checkbox.Root
            mx="l"
            alignItems="flex-start"
            disabled={!isAvailable}
            checked={selectedFormats.includes(format)}
            onCheckedChange={(details) =>
              toggleFormat(format, !!details.checked)
            }
            data-testid={`download-${format}-checkbox`}
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control
              borderRadius="full"
              mt="4px"
              bg="transparent"
              borderWidth="2px"
              borderColor="border.neutral"
              _checked={{
                bg: "colorPalette.solid",
                borderColor: "colorPalette.solid",
              }}
            >
              {null}
            </Checkbox.Control>
            <Checkbox.Label>
              <VStack align="flex-start" gap="4px" opacity={isAvailable ? 1 : 0.5}>
                <HStack>
                  <Text
                    color="content.secondary"
                    fontFamily="heading"
                    fontSize="title.md"
                    fontWeight="semibold"
                    lineHeight="24"
                  >
                    {t(`download-${format}-format`)}
                  </Text>
                  {!isAvailable && (
                    <Badge
                      borderWidth="1px"
                      borderColor="border.neutral"
                      py="4px"
                      px="8px"
                      borderRadius="16px"
                      color="content.secondary"
                      fontSize="body.sm"
                      bg="base.light"
                    >
                      <Text>{t("coming-soon")}</Text>
                    </Badge>
                  )}
                </HStack>
                <Text
                  color="content.tertiary"
                  fontFamily="body"
                  fontSize="body.md"
                  fontWeight="regular"
                  lineHeight="20"
                  letterSpacing="wide"
                >
                  {t(`download-${format}-format-description`)}
                </Text>
              </VStack>
            </Checkbox.Label>
          </Checkbox.Root>
        </React.Fragment>
      ))}
      <Separator borderColor="border.overlay" my="l" />
      <HStack justify="flex-end" mx="l" gap="m">
        <Button variant="outline" onClick={onClose} data-testid="download-cancel-button">
          {t("cancel")}
        </Button>
        <Button
          variant="solid"
          disabled={selectedFormats.length === 0}
          onClick={handleConfirmDownload}
          data-testid="download-confirm-button"
        >
          {t("download")}
        </Button>
      </HStack>
      <Toaster />
    </Box>
  );
};

export default DownloadButtons;
