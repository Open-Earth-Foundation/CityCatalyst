import { TFunction } from "i18next";
import { Text } from "@chakra-ui/react";

export const BlueSubtitle = ({
  t,
  text,
}: {
  t: TFunction<string, undefined>;
  text: string;
}) => (
  <Text
    fontFamily="heading"
    fontSize="title.md"
    fontWeight="semibold"
    lineHeight="24"
    my={4}
    color="blue"
  >
    {t(text).toUpperCase()}
  </Text>
);
