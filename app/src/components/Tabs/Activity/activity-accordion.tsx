import { ActivityData } from "@/models/ActivityData";
import { ActivityValue } from "@/models/ActivityValue";
import { convertKgToTonnes, getInputMethodology } from "@/util/helpers";
import { AddIcon } from "@chakra-ui/icons";
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  IconButton,
  Table,
  TableContainer,
  Tag,
  TagLabel,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Icon,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import React, { FC } from "react";
import { MdMoreVert, MdModeEditOutline } from "react-icons/md";
import { FiTrash2 } from "react-icons/fi";
import {
  DirectMeasure,
  ExtraField,
  findMethodology,
  MANUAL_INPUT_HIERARCHY,
  Methodology,
} from "@/util/form-schema";

interface ActivityAccordionProps {
  t: TFunction;
  activityData: ActivityValue[] | undefined;
  showActivityModal: () => void;
  methodologyId: string | undefined;
  onDeleteActivity: (activity: ActivityValue) => void;
  onEditActivity: (activity: ActivityValue) => void;
  referenceNumber: string;
}

const ActivityAccordion: FC<ActivityAccordionProps> = ({
  t,
  activityData,
  showActivityModal,
  methodologyId,
  onDeleteActivity,
  onEditActivity,
  referenceNumber,
}) => {
  const methodologyName = getInputMethodology(methodologyId!);
  const methodology = findMethodology(methodologyId!, referenceNumber);
  let extraFields = (methodology as Methodology)?.activities?.[0]?.[
    "extra-fields"
  ] as ExtraField[];

  return (
    <Accordion defaultIndex={[0]} allowMultiple>
      <AccordionItem
        backgroundColor="white"
        borderWidth="1px"
        padding="0px"
        borderColor="border.overlay"
      >
        <h2>
          <AccordionButton padding="0px">
            <Box
              display="flex"
              justifyContent="space-between"
              w="full"
              padding="24px"
              alignItems="center"
            >
              <Box display="flex" flexDir="column" alignItems="start" gap="8px">
                <Text
                  fontFamily="heading"
                  fontSize="title.md"
                  fontWeight="semibold"
                >
                  {t("commercial-buildings")}
                </Text>
                <Text
                  color="content.tertiary"
                  letterSpacing="wide"
                  fontSize="body.md"
                >
                  {activityData?.length} {t("activities-added")}
                </Text>
              </Box>
              <Box alignItems="start" display="flex" fontFamily="heading">
                <Text fontWeight="medium">{t("total-consumption")}:&nbsp;</Text>
                <Text fontWeight="normal">0M gallons</Text>
              </Box>
              <Box alignItems="start" display="flex" fontFamily="heading">
                <Text fontWeight="medium">{t("emissions")}:&nbsp;</Text>
                <Text fontWeight="normal">0tCO2e</Text>
              </Box>
              <Box pr="56px">
                <IconButton
                  bg="none"
                  pos="relative"
                  onClick={(e) => {
                    e.stopPropagation();
                    showActivityModal();
                  }}
                  _hover={{ bg: "none" }}
                  aria-label="add-activity"
                  icon={<AddIcon color="interactive.control" fontSize="24px" />}
                />
              </Box>
            </Box>
            <AccordionIcon
              color="interactive.control"
              marginRight="24px"
              style={{ fontSize: "40px" }}
            />
          </AccordionButton>
        </h2>
        <AccordionPanel padding="0px" pb={4}>
          <TableContainer px={0}>
            <Table
              variant="simple"
              borderLeft="0px"
              borderBottom="0px"
              borderRight="0px"
              borderWidth="1px"
              borderRadius="20px"
            >
              <Thead backgroundColor="background.backgroundLight">
                <Tr>
                  {extraFields?.length! > 0 && <Th>{t(extraFields[0].id)}</Th>}
                  <Th>{t("data-quality")}</Th>
                  <Th>{t("fuel-consumption")}</Th>
                  <Th>{t("emissions")}</Th>
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody>
                {activityData?.map((activity: any, i: number) => {
                  return (
                    <Tr key={i}>
                      {extraFields?.length! > 0 && (
                        <Td>
                          {t(activity?.activityData?.[extraFields[0].id])}
                        </Td>
                      )}
                      <Td>
                        <Tag
                          size="lg"
                          variant="outline"
                          colorScheme="blue"
                          borderRadius="full"
                        >
                          <TagLabel>
                            {t(activity?.dataSource.dataQuality)}
                          </TagLabel>
                        </Tag>
                      </Td>
                      <Td>{activity?.fuelConsumption!}</Td>
                      <Td>{convertKgToTonnes(activity?.co2eq)}</Td>
                      <Td>
                        <Popover>
                          <PopoverTrigger>
                            <IconButton
                              icon={<MdMoreVert size="24px" />}
                              aria-label="more-icon"
                              variant="ghost"
                              color="content.tertiary"
                            />
                          </PopoverTrigger>
                          <PopoverContent
                            w="auto"
                            borderRadius="8px"
                            shadow="2dp"
                            px="0"
                          >
                            <PopoverArrow />
                            <PopoverBody p="0px">
                              <Box
                                p="16px"
                                display="flex"
                                alignItems="center"
                                gap="16px"
                                _hover={{
                                  bg: "content.link",
                                  cursor: "pointer",
                                }}
                                className="group"
                                onClick={() => onEditActivity(activity)}
                              >
                                <Icon
                                  className="group-hover:text-white"
                                  color="interactive.control"
                                  as={MdModeEditOutline}
                                  h="24px"
                                  w="24px"
                                />
                                <Text
                                  className="group-hover:text-white"
                                  color="content.primary"
                                >
                                  {t("update-activity")}
                                </Text>
                              </Box>
                              <Box
                                p="16px"
                                display="flex"
                                alignItems="center"
                                gap="16px"
                                _hover={{
                                  bg: "content.link",
                                  cursor: "pointer",
                                }}
                                className="group"
                                onClick={() => onDeleteActivity(activity)}
                              >
                                <Icon
                                  className="group-hover:text-white"
                                  color="sentiment.negativeDefault"
                                  as={FiTrash2}
                                  h="24px"
                                  w="24px"
                                />
                                <Text
                                  className="group-hover:text-white"
                                  color="content.primary"
                                >
                                  {t("delete-activity")}
                                </Text>
                              </Box>
                            </PopoverBody>
                          </PopoverContent>
                        </Popover>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </TableContainer>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
};

export default ActivityAccordion;
