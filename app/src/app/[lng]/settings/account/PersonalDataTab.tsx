"use client";

import { useState } from "react";
import { Box, Button, HStack } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { BodyMedium, TitleMedium } from "@/components";
import { UseErrorToast } from "@/hooks/Toasts";

type DownloadFormat = "json" | "csv";

function filenameFromResponse(
  response: Response,
  format: DownloadFormat,
): string {
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/);
  return match?.[1] ?? `personal-data.${format}`;
}

async function downloadPersonalData(format: DownloadFormat): Promise<void> {
  const response = await fetch(`/api/v1/user/data-download?format=${format}`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Personal data download failed");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filenameFromResponse(response, format);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const PersonalDataTab = ({ t }: { t: TFunction }) => {
  const [downloading, setDownloading] = useState<DownloadFormat | null>(null);
  const { showErrorToast } = UseErrorToast({
    title: t("personal-data-download-failed"),
  });

  const onDownload = async (format: DownloadFormat) => {
    setDownloading(format);
    try {
      await downloadPersonalData(format);
    } catch {
      showErrorToast();
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Box
      backgroundColor="white"
      p={6}
      display="flex"
      flexDirection="column"
      gap="24px"
      borderRadius="8px"
      boxShadow="shadow-lg"
    >
      <TitleMedium>{t("your-data")}</TitleMedium>
      <BodyMedium>{t("your-data-description")}</BodyMedium>
      <HStack gap={3}>
        <Button
          onClick={() => onDownload("json")}
          loading={downloading === "json"}
          disabled={downloading !== null}
        >
          {t("download-json")}
        </Button>
        <Button
          variant="outline"
          onClick={() => onDownload("csv")}
          loading={downloading === "csv"}
          disabled={downloading !== null}
        >
          {t("download-csv")}
        </Button>
      </HStack>
    </Box>
  );
};

export default PersonalDataTab;
