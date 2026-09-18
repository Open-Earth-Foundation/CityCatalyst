import type { TFunction } from "i18next";
import { Text } from "@chakra-ui/react";

export function UnpublishedView({ t }: { t: TFunction }) {
  return (
    <Text
      color="content.tertiary"
      fontFamily="body"
      fontSize="body.md"
      fontWeight="regular"
      lineHeight="20"
      letterSpacing="wide"
    >
      {t("make-public-description")}
    </Text>
  );
}
