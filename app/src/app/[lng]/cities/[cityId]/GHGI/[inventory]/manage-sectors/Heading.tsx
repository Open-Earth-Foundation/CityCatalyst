import { Button } from "@/components/ui/button";
import { Box, Icon, Text } from "@chakra-ui/react";
import { usePathname, useRouter } from "next/navigation";
import { MdArrowBack } from "react-icons/md";
import type { FC } from "react";
import type { TFunction } from "i18next";

interface HeadingProps {
  t: TFunction;
}

const Heading: FC<HeadingProps> = ({ t }) => {
  const router = useRouter();
  const pathname = usePathname();
  const inventoryHomePath = pathname.replace(/\/manage-sectors\/?$/, "");

  return (
    <Box pt="48px" display="flex" flexDir="column" gap="64px">
      <Box display="flex" alignItems="center">
        <Button
          variant="ghost"
          color="content.link"
          px={1}
          onClick={() => router.push(inventoryHomePath)}
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
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Box>
          <Text
            fontSize="headline.lg"
            color="content.primary"
            fontWeight="bold"
            lineHeight="32px"
            mb="8px"
            fontFamily="heading"
          >
            {t("notation-keys")}
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
        <Button variant="outline">{t("help-button")}</Button>
      </Box>
    </Box>
  );
};

export default Heading;
