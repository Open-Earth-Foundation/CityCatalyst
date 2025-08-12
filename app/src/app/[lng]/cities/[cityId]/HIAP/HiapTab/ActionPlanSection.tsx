import { Badge, Box, Button, Card, Icon, Text } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { DownloadIcon } from "@/components/icons";
import { FaCaretDown } from "react-icons/fa";
import { TopPickIcon } from "@/components/icons";

const ActionPlanSection = ({ t }: { t: TFunction }) => {
  return (
    <Box w="1090px" mx="auto" py="48px" display="flex" flexDirection="column">
      {/* Heading with action button */}
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        w="full"
      >
        <Text
          color="content.primary"
          fontSize="title.lg"
          fontWeight="semibold"
          fontFamily="heading"
          mb={2}
        >
          {t("generate-climate-actions-title")}
        </Text>
        <Button variant="ghost" color="interactive.control" p="4px">
          <Icon as={DownloadIcon} />
          <Text>{t("download-action-plan")}</Text>
          <Icon as={FaCaretDown} color="interactive.control" />
        </Button>
      </Box>
      <Text
        fontSize="body.lg"
        color="content.tertiary"
        fontWeight="normal"
        mt="8px"
      >
        {t("generate-climate-actions-widget-description")}
      </Text>
      <Box display="grid" gridColumn="3" py="24px" gap="24px">
        <Card.Root
          p="24px"
          borderRadius="8px"
          maxW="353px"
          bg="background.secondary"
          gap="16px"
        >
          <Card.Title display="flex" alignItems="center" gap="4px">
            <Icon as={TopPickIcon} />
            <Text
              textTransform="uppercase"
              fontSize="body.sm"
              fontWeight="semibold"
              color="content.link"
              fontFamily="heading"
            >
              {t("top-pick-action-title")}
            </Text>
          </Card.Title>
          <Card.Description>
            <Text
              textOverflow="ellipsis"
              overflow="hidden"
              whiteSpace="nowrap"
              lineClamp={2}
              fontFamily="heading"
              fontWeight="bold"
              fontSize="title.lg"
              color="content.secondary"
              lineHeight="28px"
            >
              {t("integrate-renewables-into-municipal-water-systems")}
            </Text>
            <Text fontSize="body.sm" color="content.tertiary">
              {t(
                "integrate-renewables-into-municipal-water-systems-description",
              )}
            </Text>
            <Box display="flex" gap="8px">
              <LevelBadge level="high" type="reduction-potential" t={t} />
              <LevelBadge level="high" type="cost" t={t} />
              <LevelBadge level="high" type="effectiveness" t={t} />
            </Box>
          </Card.Description>
        </Card.Root>
      </Box>
    </Box>
  );
};

export default ActionPlanSection;

const LevelBadge = ({
  level,
  type,
  t,
}: {
  level: string;
  type: string;
  t: TFunction;
}) => {
  return (
    <Badge
      bg="segmented.NegativeDefault"
      fontSize="xs"
      w="98px"
      h="5px"
      borderRadius="2.5px"
    ></Badge>
  );
};
