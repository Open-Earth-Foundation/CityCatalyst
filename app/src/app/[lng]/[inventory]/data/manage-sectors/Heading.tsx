import i18n from "i18next";
import { ManageDataIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Box, Icon, Text } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { MdArrowBack } from "react-icons/md";
import type { FC } from "react";
import type { TFunction } from "i18next";

interface HeadingProps {
  t: TFunction;
  inventoryParam: string;
}

const Heading: FC<HeadingProps> = ({ t, inventoryParam }) => {
  const router = useRouter();
  return (
    <Box pt="48px" display="flex" flexDir="column" gap="64px">
      <Box display="flex" alignItems="center">
        <Button
          variant="ghost"
          color="content.link"
          px={1}
          onClick={() => router.push(`/${i18n.language}/${inventoryParam}`)}
        >
          <Icon as={MdArrowBack} />
          {t("go-back")}
        </Button>
        <Box
          h="24px"
          borderRightWidth={1}
          borderColor="border.neutral"
          w="24px"
        />
      </Box>
      <Box display="flex" gap="16px">
        <Box>
          <Icon as={ManageDataIcon} color="interactive.control" />
        </Box>
        <Box>
          <Text
            fontSize="headline.lg"
            color="content.primary"
            fontWeight="bold"
            lineHeight="32px"
            mb="8px"
            fontFamily="heading"
          >
            {t("manage-missing-subsectors")}
          </Text>
          <Text
            fontSize="body.lg"
            color="content.tertiary"
            lineHeight="32px"
            mb="8px"
            fontFamily="body"
          >
            {t("manage-missing-subsectors-description")}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};

export default Heading;
