"use client";

import { TFunction } from "i18next";
import {
  Box,
  Card,
  Heading,
  Icon,
  IconButton,
  Input,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MdClose, MdUpload } from "react-icons/md";
import { useRef } from "react";
import { bytesToMB } from "@/util/helpers";

interface UploadFileStepProps {
  t: TFunction;
  uploadedFile: File | null;
  onFileUpload: (file: File) => void;
  onRemoveFile: () => void;
  isUploading: boolean;
}

export default function UploadFileStep({
  t,
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
        <Heading size="lg">{t("upload-inventory-file-heading")}</Heading>
        <Text fontSize="body.lg" color="content.tertiary">
          {t("upload-inventory-file-description")}
        </Text>
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
        {uploadedFile ? (
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            w="full"
          >
            <Box display="flex" alignItems="center" gap="16px">
              <Icon as={MdUpload} boxSize={6} color="interactive.primary" />
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
              <Icon as={MdClose} boxSize={5} color="content.tertiary"/>
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
                  {t("file-formats")}
                </Text>
              </Box>
            </VStack>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx"
              onChange={handleFileSelect}
              display="none"
              disabled={isUploading}
            />
          </Box>
        )}
      </Card.Root>
    </Box>
  );
}
