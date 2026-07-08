"use client";

import { TFunction } from "i18next";
import {
  Box,
  Card,
  Heading,
  Icon,
  IconButton,
  Input,
  Link,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MdClose, MdUpload } from "react-icons/md";
import Image from "next/image";
import { useRef } from "react";

function getFileIcon(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "/assets/pdf_file_icon.svg";
  if (ext === "csv") return "/assets/csv_file_icon.svg";
  return "/assets/excel_file_icon.svg";
}
import { bytesToMB } from "@/util/helpers";

interface UploadFileStepProps {
  t: TFunction;
  cityName?: string;
  uploadedFile: File | null;
  onFileUpload: (file: File) => void;
  onRemoveFile: () => void;
  isUploading: boolean;
}

export default function UploadFileStep({
  t,
  cityName,
  uploadedFile,
  onFileUpload,
  onRemoveFile,
  isUploading,
}: UploadFileStepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileUpload(file);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
      onFileUpload(file);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleRemoveFile = () => {
    // Clear the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    // Call the parent's remove handler
    onRemoveFile();
  };

  return (
    <Box w="full">
      <Box display="flex" flexDir="column" gap="24px" mb={6}>
        {cityName && (
          <Text fontSize="body.md" color="content.tertiary" fontWeight="medium">
            {cityName}
          </Text>
        )}
        <Heading
          as="h1"
          color="content.primary"
          fontSize="display.sm"
          lineHeight="44px"
          fontWeight="600"
        >
          {t("upload-inventory-file-heading")}
        </Heading>
      </Box>

      <Card.Root
        px={6}
        py={8}
        shadow="none"
        bg="white"
        w="full"
        borderRadius="lg"
        borderWidth="1px"
        borderColor="border.default"
      >
        {isUploading ? (
          <VStack gap="16px" py={12} alignItems="center" justifyContent="center">
            <Spinner size="lg" />
            <Box textAlign="center">
              <Text fontWeight="medium" fontSize="body.md">
                {t("uploading-file")}
              </Text>
              <Text fontSize="body.sm" color="content.tertiary">
                {t("please-wait")}
              </Text>
            </Box>
          </VStack>
        ) : uploadedFile ? (
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            w="full"
          >
            <Box display="flex" alignItems="center" gap="16px">
              <Image
                src={getFileIcon(uploadedFile.name)}
                alt={uploadedFile.name.split(".").pop()?.toUpperCase() ?? "file"}
                width={32}
                height={32}
              />
              <Box>
                <Text fontWeight="medium" fontSize="body.md">
                  {uploadedFile.name}
                </Text>
                <Text fontSize="body.sm" color="content.tertiary">
                  {bytesToMB(uploadedFile.size)}
                </Text>
              </Box>
            </Box>
            <IconButton
              variant="ghost"
              aria-label={t("remove-file")}
              onClick={handleRemoveFile}
              colorScheme="gray"
              size="md"
            >
              <Icon as={MdClose} boxSize={5} color="content.tertiary" />
            </IconButton>
          </Box>
        ) : (
          <Box
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            borderWidth="2px"
            borderStyle="dashed"
            borderColor="border.default"
            borderRadius="lg"
            p={8}
            textAlign="center"
            cursor="pointer"
            _hover={{
              borderColor: "interactive.primary",
              bg: "background.subtle",
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <VStack gap="16px">
              <Icon as={MdUpload} boxSize={8} color="content.tertiary" />
              <Box>
                <Text fontWeight="medium" fontSize="body.md">
                  {t("click-to-upload")}
                </Text>
                <Text fontSize="body.sm" color="content.tertiary" mt={2}>
                  {t("file-formats")}{" "}
                  <Text as="span" fontWeight="bold">.CSV, .XLSX,</Text>
                  {" "}and{" "}
                  <Text as="span" fontWeight="bold">.PDF</Text>
                </Text>
                <Text fontSize="body.sm" color="content.tertiary">
                  {t("max-file-size")}{" "}
                  <Text as="span" fontWeight="bold">20MB</Text>
                </Text>
              </Box>
            </VStack>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf"
              onChange={handleFileSelect}
              display="none"
              disabled={isUploading}
            />
          </Box>
        )}

        {!isUploading && <Box
          display="flex"
          alignItems="center"
          gap="12px"
          mt={6}
        >
          <Image
            src="/assets/data-portal-for-cities-logo.svg"
            alt="Data Portal for Cities"
            width={130}
            height={36}
            style={{ flexShrink: 0 }}
          />
          <Text
            fontSize="body.lg"
            color="content.tertiary"
            fontFamily="body"
            fontWeight="regular"
            lineHeight="24"
            letterSpacing="wide"
          >
            {t("data-portal-banner-text")}
            <Link
              display="block"
              href="https://dataportalforcities.org/"
              target="_blank"
              rel="noopener noreferrer"
              color="content.link"
              fontFamily="body"
              fontSize="body.lg"
              fontWeight="regular"
              lineHeight="24"
              letterSpacing="wide"
              textDecoration="underline"
            >
              {t("data-portal-link")}.
            </Link>
          </Text>
        </Box>}
      </Card.Root>
    </Box>
  );
}
