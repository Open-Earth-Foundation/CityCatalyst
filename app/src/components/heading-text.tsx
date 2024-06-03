import { Text } from "@chakra-ui/react";
import React, { FC } from "react";

interface HeadingTextProps {
  title: string;
}

const HeadingText: FC<HeadingTextProps> = ({ title }) => {
  return (
    <Text fontFamily="heading" fontSize="title.lg" fontWeight="bold">
      {title}
    </Text>
  );
};

export default HeadingText;
