import { Box, Flex, Icon, Text, Link } from "@chakra-ui/react";
import { ReactElement } from "react";
import { BodyLarge } from "@/components/package/Texts/Body";

interface DialogItemProps {
  icon: ReactElement;
  title: string;
  description: string | ReactElement;
}

export default function DialogItem({
  icon,
  title,
  description,
}: DialogItemProps) {
  return (
    <Box w="full" display="flex" gap="24px" justifyContent="flex-start">
      <Box>
        <Flex
          w="48px"
          h="48px"
          bg="background.neutral"
          borderRadius="full"
          alignItems="center"
          justifyContent="center"
        >
          <Icon as={() => icon} boxSize="24px" />
        </Flex>
      </Box>
      <Box w="full" display="flex" flexDirection="column" gap="8px">
        <Text fontFamily="heading" fontWeight="bold" fontSize="title.md">
          {title}
        </Text>
        <BodyLarge fontFamily="body" fontWeight="normal" lineHeight="24px">
          {description}
        </BodyLarge>
      </Box>
    </Box>
  );
}
