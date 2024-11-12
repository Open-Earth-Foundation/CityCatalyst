import type { TFunction } from "i18next";
import {
  Badge,
  Box,
  Button,
  CloseButton,
  Spacer,
  Text,
  useToast,
} from "@chakra-ui/react";
import React, { MouseEventHandler } from "react";
import { InfoOutlineIcon } from "@chakra-ui/icons";
import { MdCheckCircleOutline } from "react-icons/md";
import { FiDownload } from "react-icons/fi";

const DownloadButtons = ({
  t,
  lng,
  inventoryId,
  cityLocode,
  inventoryYear,
}: {
  t: TFunction;
  lng: string;
  inventoryId: string | undefined;
  cityLocode: string | undefined;
  inventoryYear: number | undefined;
}) => {
  const DOWNLOAD_BUTTONS = {
    ciris: { isAvailable: false },
    ecrf: { isAvailable: true },
    csv: { isAvailable: true },
    pdf: { isAvailable: false },
  };

  enum STATUS {
    INFO = "info",
    SUCCESS = "success",
    ERROR = "error",
  }

  const toast = useToast();

  const showToast = (
    title: string,
    description: string,
    status: any,
    duration: number | null,
    bgColor: string,
    showAnimatedGradient: boolean = false,
  ) => {
    // Replace previous toast notifications
    if (duration == null) {
      toast.closeAll();
    }

    const animatedGradientClass = `bg-gradient-to-l from-brand via-brand_light to-brand bg-[length:200%_auto] animate-gradient`;
    toast({
      description: t(description),
      status: status,
      duration: duration,
      isClosable: true,
      render: ({
        onClose,
      }: {
        onClose: MouseEventHandler<HTMLButtonElement>;
      }) => (
        <Box
          display="flex"
          gap="8px"
          color="white"
          alignItems="center"
          p={3}
          bg={showAnimatedGradient ? undefined : bgColor}
          className={showAnimatedGradient ? animatedGradientClass : undefined}
          width="600px"
          height="60px"
          borderRadius="8px"
        >
          <Box display="flex" gap="8px" alignItems="center">
            {status === "info" || status === "error" ? (
              <InfoOutlineIcon fontSize="24px" />
            ) : (
              <MdCheckCircleOutline fontSize="24px" />
            )}
            <Text
              color="base.light"
              fontWeight="bold"
              lineHeight="52"
              fontSize="label.lg"
            >
              {t(title)}
            </Text>
          </Box>
          <Spacer />
          {status === "error" && (
            <Button
              variant="lightGhost"
              onClick={() => handleDownload("csv")}
              fontWeight="600"
              fontSize="16px"
              letterSpacing="1.25px"
            >
              {t("try-again")}
            </Button>
          )}
          <CloseButton onClick={onClose} />
        </Box>
      ),
    });
  };

  const handleDownload = (format: string) => {
    showToast(
      "preparing-dataset",
      "wait-fetch-data",
      STATUS.INFO,
      null,
      "semantic.info",
      true, // animated gradient
    );
    fetch(
      `/api/v0/inventory/${inventoryId}/download?format=${format}&lng=${lng}`,
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
            showToast(
              "download-complete",
              "downloading-data",
              STATUS.SUCCESS,
              null,
              "interactive.primary",
            );
            URL.revokeObjectURL(downloadLink.href);
            downloadLink.remove();
          });
        }
      })
      .catch((error) => {
        console.error("Download error:", error);
        showToast(
          "download-failed",
          "download-error",
          STATUS.ERROR,
          null,
          "semantic.danger",
        );
      });
  };

  return (
    <Box display="flex" flexDirection="column">
      {Object.entries(DOWNLOAD_BUTTONS).map(([format, { isAvailable }]) => (
        <Button
          key={format}
          my="16px"
          mx="24px"
          variant="ghost"
          leftIcon={<FiDownload fontSize="32px" />}
          isDisabled={!isAvailable}
          style={{
            backgroundColor: "white",
            color: "black",
          }}
          textTransform="none"
          justifyContent="flex-start"
          onClick={() => handleDownload(format)}
        >
          <Text
            fontSize="body.lg"
            color="body"
            opacity={isAvailable ? 1 : 0.5}
            mx="16px"
          >
            {t(`download-${format}`)}
          </Text>
          {!isAvailable && (
            <Badge
              mx="16px"
              borderWidth="1px"
              borderColor="border.neutral"
              py="4px"
              px="8px"
              borderRadius="full"
              textColor="content.secondary"
              fontSize="body.sm"
              bg="base.light"
            >
              <Text>{t("coming-soon")}</Text>
            </Badge>
          )}
        </Button>
      ))}
    </Box>
  );
};

export default DownloadButtons;
