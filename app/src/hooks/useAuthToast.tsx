import { Box, Text } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { toaster } from "@/components/ui/toaster";

export function useAuthToast(t: TFunction) {
  const showLoginSuccessToast = () => {
    return toaster.create({
      title: t("verified-toast-title"),
      description: t("verified-toast-description"),
      type: "success",
      duration: 3000,
      placement: "top",
      // Todo: add custom styles to toaster
      //   render: () => (
      //     <Box
      //       borderRadius="8px"
      //       padding="16px"
      //       display="flex"
      //       bg="interactive.primary"
      //       gap="16px"
      //       color="base.light"
      //       alignItems="center"
      //     >
      //       <CheckCircleIcon boxShadow={6} />
      //       <Text
      //         fontFamily="heading"
      //         fontWeight="bold"
      //         lineHeight="24px"
      //         fontSize="title.md"
      //       >
      //         {t("logged-in-successful")}
      //       </Text>
      //     </Box>
      //   )
    });
  };

  return { showLoginSuccessToast };
}
