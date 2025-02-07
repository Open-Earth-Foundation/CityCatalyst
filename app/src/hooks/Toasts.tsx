import { CheckCircleIcon, WarningIcon } from "@chakra-ui/icons";
import { Box, Text, useToast } from "@chakra-ui/react";

export function UseSuccessToast(props: {
  title: string;
  description: string;
  text: string;
}) {
  const toast = useToast();
  const { title, description, text } = props;
  const showSuccessToast = () => {
    return toast({
      title,
      description,
      status: "success",
      duration: 3000,
      isClosable: true,
      position: "top",
      render: () => (
        <Box
          borderRadius="8px"
          padding="16px"
          display="flex"
          bg="interactive.primary"
          gap="16px"
          color="base.light"
          alignItems="center"
        >
          <CheckCircleIcon boxShadow={6} />
          <Text
            fontFamily="heading"
            fontWeight="bold"
            lineHeight="24px"
            fontSize="title.md"
          >
            {text}
          </Text>
        </Box>
      ),
    });
  };

  return { showSuccessToast };
}

export function UseErrorToast(props: {
  title: string;
  description: string;
  text: string;
}) {
  const toast = useToast();
  const { title, description, text } = props;
  const showErrorToast = () => {
    return toast({
      title,
      description,
      status: "error",
      duration: 6000,
      isClosable: true,
      position: "top",
      render: () => (
        <Box
          borderRadius="8px"
          padding="16px"
          display="flex"
          bg="sentiment.negativeDefault"
          gap="16px"
          color="base.light"
          alignItems="center"
        >
          <WarningIcon boxShadow={6} />
          <Text
            fontFamily="heading"
            fontWeight="bold"
            lineHeight="24px"
            fontSize="title.md"
          >
            {text}
          </Text>
        </Box>
      ),
    });
  };

  return { showErrorToast };
}
