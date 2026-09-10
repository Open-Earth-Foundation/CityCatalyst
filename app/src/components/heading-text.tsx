import { Text } from "@chakra-ui/react";
import React, { FC } from "react";

interface HeadingTextProps {
  title: string;
  "data-testid"?: string;
}

const HeadingText: FC<HeadingTextProps> = ({ title, "data-testid": testId }) => {
  return (
    <Text
      data-testid={testId}
      fontFamily="heading"
      fontSize="title.lg"
      fontWeight="bold"
    >
      {title}
    </Text>
  );
};

export default HeadingText;
