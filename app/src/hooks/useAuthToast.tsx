import { CheckCircleIcon } from "@chakra-ui/icons";
import { Box, Text, useToast } from "@chakra-ui/react";
import { TFunction } from "i18next";

export function useAuthToast(t: TFunction) {
  const toast = useToast();

  const showLoginSuccessToast = () => {
    return toast({
      title: t("verified-toast-title"),
      description: t("verified-toast-description"),
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
            {t("logged-in-successful")}
          </Text>
        </Box>
      ),
    });
  };

  return { showLoginSuccessToast };
}
