import { CheckCircleIcon } from "@chakra-ui/icons";
import { Box, Card, Text } from "@chakra-ui/react";
import { FcGoogle } from "react-icons/fc";
import { MdCheckCircleOutline } from "react-icons/md";
import { ExcelFileIcon } from "../icons";

const FileDataCard = () => {
  return (
    <Card
      w="331px"
      h="100px"
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
          >
            Your_data_file.csv
          </Text>
          <Text
            fontSize="body.md"
            fontWeight="normal"
            fontStyle="normal"
            lineHeight="20px"
            letterSpacing="wide"
            color="interactive.control"
          >
            1.5MB
          </Text>
        </Box>
      </Box>
    </Card>
  );
};

export default FileDataCard;
