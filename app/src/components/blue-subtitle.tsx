import { TFunction } from "i18next";
import { undefined } from "zod";
import { Text } from "@chakra-ui/react";
import { Trans } from "react-i18next/TransWithoutContext";

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
    textColor={"blue"}
  >
    {t(text).toUpperCase()}
  </Text>
);
