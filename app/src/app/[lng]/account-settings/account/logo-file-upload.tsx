// FileUploadCard.tsx
import {
  FileUploadRoot,
  FileUploadDropzone,
  FileUploadList,
} from "@/components/ui/file-upload";
import { Box, Icon, Image, Text, useFileUploadContext } from "@chakra-ui/react";
import { MdOutlineAddAPhoto } from "react-icons/md";

const LogoUploadCard = ({ url }: { url?: string }) => {
  const { acceptedFiles: files } = useFileUploadContext();

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
                src={"/assets/wide-logo.png"}
                alt="Uploaded preview"
                objectFit="cover"
                w="100%"
                h="100%"
                borderRadius="2xl"
              />
            )}
          </Box>
        }
      />
      <FileUploadList files={files} clearable />
    </>
  );
};

export default LogoUploadCard;
