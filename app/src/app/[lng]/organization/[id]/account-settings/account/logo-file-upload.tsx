// FileUploadCard.tsx
import {
  FileUploadRoot,
  FileUploadDropzone,
  FileUploadList,
} from "@/components/ui/file-upload";
import {
  Box,
  Icon,
  IconButton,
  Image,
  Text,
  useFileUploadContext,
} from "@chakra-ui/react";
import { MdMoreVert, MdOutlineAddAPhoto } from "react-icons/md";
import React, { useEffect } from "react";
import { CiCircleRemove } from "react-icons/ci";

const LogoUploadCard = ({
  defaultUrl,
  setFile,
  clearImage,
}: {
  defaultUrl?: string;
  setFile: (file: File | null) => void;
  clearImage: () => void;
}) => {
  const { acceptedFiles: files, clearFiles } = useFileUploadContext();

  const handleDelete = () => {
    clearFiles();
    clearImage();
  };

  useEffect(() => {
    if (files.length > 0) {
      setFile(files[0]);
    }
  }, [files]);

  return (
    <>
      <FileUploadDropzone
        h="80px"
        minH="80px"
        p={0}
        label={
          <Box
            rounded="spacing.2"
            w="250px"
            h="80px"
            textAlign="center"
            color="gray.200"
            display="flex"
            alignItems="center"
            justifyContent="center"
            position="relative"
          >
            <Box
              bg="base.dark/60"
              position="absolute"
              borderRadius="full"
              display="flex"
              alignItems="center"
              h={12}
              w={12}
              justifyContent="center"
            >
              <Icon as={MdOutlineAddAPhoto} boxSize={6} />
            </Box>
            {files.length > 0 ? (
              <Image
                src={URL.createObjectURL(files[0])}
                alt="Uploaded preview"
                objectFit="cover"
                w="100%"
                h="100%"
                borderRadius="2xl"
              />
            ) : (
              <Image
                src={defaultUrl ? defaultUrl : "/assets/wide-logo.png"}
                alt="Uploaded preview"
                objectFit="cover"
                w="100%"
                h="100%"
                borderRadius="2xl"
              />
            )}
            {(files.length > 0 || defaultUrl) && (
              <IconButton
                data-testid="activity-more-icon"
                aria-label="more-icon"
                variant="ghost"
                ml={2}
                position="absolute"
                left="100%"
                color="content.tertiary"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
              >
                <Icon as={CiCircleRemove} size="lg" />
              </IconButton>
            )}
          </Box>
        }
      />
      <FileUploadList files={files} clearable />
    </>
  );
};

export default LogoUploadCard;
