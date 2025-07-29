"use client";

import { Box, Card, Tag, Text } from "@chakra-ui/react";
import { ExcelFileIcon } from "../icons";
import { FC } from "react";
import { bytesToMB } from "@/util/helpers";

interface FileCardDataProps {
  fileName: string;
  fileSize: number;
  subsectors: string;
}

const FileDataCard: FC<FileCardDataProps> = ({
  fileName,
  fileSize,
  subsectors,
}) => {
  const tags = subsectors.split(",").map((item: string) => item.trim());
  return (
    <Card.Root
      minW="200px"
      maxH="150px"
      shadow="none"
      borderRadius="8px"
      borderWidth="1px"
      borderColor="border.overlay"
      py="16px"
      px="16px"
    >
      <Box display="flex" gap="16px">
        <Box display="flex" alignItems="center" color="interactive.tertiary">
          <ExcelFileIcon size="32px" />
        </Box>
        <Box display="flex" flexDirection="column" gap="8px">
          <Text
            fontSize="label.lg"
            fontWeight="bold"
            fontStyle="normal"
            fontFamily="heading"
            lineHeight="20px"
            letterSpacing="wide"
            truncate
            maxW="200px"
          >
            {fileName}
          </Text>
          <Text
            fontSize="body.md"
            fontWeight="normal"
            fontStyle="normal"
            lineHeight="20px"
            letterSpacing="wide"
            color="interactive.control"
          >
            {bytesToMB(fileSize)}
          </Text>
        </Box>
      </Box>
      <Box w="full" position="relative" pl="50px">
        {tags?.map((item: any) => (
          <Tag.Root
            key={item}
            mt={2}
            mr={2}
            size="md"
            borderRadius="full"
            variant="solid"
            color="content.alternative"
            bg="background.neutral"
            maxW="150px"
          >
            <Tag.Label>{item}</Tag.Label>
          </Tag.Root>
        ))}
      </Box>
    </Card.Root>
  );
};

export default FileDataCard;
