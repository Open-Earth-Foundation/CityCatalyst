import { DataSourceAttributes } from "@/models/DataSource";
import { ArrowBackIcon } from "@chakra-ui/icons";
import {
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerOverlay,
  Flex,
  Heading,
  Icon,
  Link,
  Stack,
  Tag,
  TagLabel,
  TagLeftIcon,
  Text,
  chakra,
} from "@chakra-ui/react";
import { RefObject } from "react";
import {
  MdCalendarToday,
  MdHomeWork,
  MdPlaylistAddCheck,
} from "react-icons/md";

export function SourceDrawer({
  source,
  isOpen,
  onClose,
  onConnectClick,
  finalFocusRef,
  t,
}: {
  source?: DataSourceAttributes;
  isOpen: boolean;
  onClose: () => void;
  onConnectClick: () => void;
  finalFocusRef?: RefObject<any>;
  t: Function;
}) {
  return (
    <Drawer
      isOpen={isOpen}
      placement="right"
      onClose={onClose}
      size="lg"
      finalFocusRef={finalFocusRef}
    >
      <DrawerOverlay />
      <DrawerContent px={0} py={0} overflowY="auto">
        <chakra.div h="full" px={[4, 4, 16]} py={12}>
          <Button
            variant="ghost"
            leftIcon={<ArrowBackIcon boxSize={6} />}
            onClick={onClose}
            px={6}
            py={4}
            mb={6}
          >
            {t("go-back")}
          </Button>
          {source && (
            <DrawerBody className="space-y-6">
              <Icon as={MdHomeWork} boxSize={9} />
              <Heading size="lg">{source.name}</Heading>
              <Flex direction="row" my={4}>
                <Tag mr={1}>
                  <TagLeftIcon
                    as={MdPlaylistAddCheck}
                    boxSize={6}
                    color="content.tertiary"
                  />
                  <TagLabel fontSize={14}>
                    {t("data-quality")}: {t("quality-" + source.dataQuality)}
                  </TagLabel>
                </Tag>
                <Tag>
                  <TagLeftIcon
                    as={MdCalendarToday}
                    boxSize={6}
                    color="content.tertiary"
                  />
                  <TagLabel fontSize={14}>
                    {t("updated-every")}{" "}
                    {source.frequencyOfUpdate == "annual"
                      ? t("year")
                      : t(source.frequencyOfUpdate)}
                  </TagLabel>
                </Tag>
              </Flex>
              <Stack className="space-y-4">
                <Text color="content.tertiary">{source.description}</Text>
                <Heading size="sm">{t("sources")}</Heading>
                <Text color="content.tertiary" ml={6}>
                  {source.sourceType}
                  {/* <ul> */}
                  {/*   {source.sources.map((source) => ( */}
                  {/*     <li key={source}>{source}</li> */}
                  {/*   ))} */}
                  {/* </ul> */}
                </Text>
                <Heading size="sm">{t("methodology")}</Heading>
                <Text color="content.tertiary">
                  <Link
                    href={source.methodologyUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {source.methodologyUrl}
                  </Link>
                </Text>
              </Stack>
            </DrawerBody>
          )}
        </chakra.div>
        <Stack w="full" px={16} className="drop-shadow-top border-t-2">
          <Button onClick={onConnectClick} w="full" h={16} my={6}>
            {t("connect-data")}
          </Button>
        </Stack>
      </DrawerContent>
    </Drawer>
  );
}
