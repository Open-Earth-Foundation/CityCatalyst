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
  Icon,
  IconButton,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
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
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import React, { FC, useMemo } from "react";
import { MdModeEditOutline, MdMoreVert } from "react-icons/md";
import { FiTrash2 } from "react-icons/fi";
import { ExtraField, findMethodology, Methodology } from "@/util/form-schema";

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

  let groupBy = methodology?.activities?.[0]["group-by"];
  const title = methodology?.activities?.[0]["activity-title"] as string;
  const tag = referenceNumber.includes("II") ? "-transport-types" : "";

  const activityGroups = useMemo<Record<string, ActivityValue[]>>(() => {
    if (!groupBy) return {};
    return activityData?.reduce((acc: any, activity: any) => {
      // TODO extend for groupby with multiple values
      const key = activity.activityData[groupBy];
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(activity);
      return acc;
    }, {});
  }, [activityData, groupBy]);

  const sourceField = extraFields.find(
    (f) => f.id.includes("-source") && f.type === "text",
  )?.id;

  console.log("sourceField", sourceField);

  const filteredFields = extraFields.filter(
    (f) => !f.id.includes(groupBy as string),
  );

  // if there is no groupBy, return the activityData as is a regular table.

  const renderTable = (list: ActivityValue[]) => {
    return (
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
              {filteredFields?.length! > 0 && (
                <Th
                  title={t(filteredFields[0].id)}
                  maxWidth="200px"
                  isTruncated
                >
                  {t(filteredFields[0].id)}
                </Th>
              )}
              <Th>{t("data-quality")}</Th>
              <Th>{t(sourceField as string)}</Th>
              <Th>{t(title)}</Th>
              <Th>{t("emissions")}</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody>
            {list?.map((activity: any, i: number) => {
              return (
                <Tr
                  title={t(activity.activityData?.[filteredFields[0].id])}
                  maxWidth="200px"
                  key={i}
                  isTruncated
                >
                  {filteredFields?.length! > 0 && (
                    <Td>{t(activity.activityData?.[filteredFields[0].id])}</Td>
                  )}
                  <Td>
                    <Tag
                      size="lg"
                      variant={activity?.dataSource.dataQuality}
                      colorScheme="blue"
                      borderRadius="full"
                    >
                      <TagLabel>{t(activity?.dataSource.dataQuality)}</TagLabel>
                    </Tag>
                  </Td>
                  <Td maxWidth="100px" isTruncated>
                    {activity?.activityData[sourceField as string]}
                  </Td>
                  <Td>
                    {parseFloat(activity?.activityData[title])}{" "}
                    {t(activity?.activityData[title + "-unit"])}
                  </Td>
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
    );
  };

  return (
    <>
      {!!groupBy ? (
        Object.keys(activityGroups)
          .sort()
          .map((key) => (
            <Accordion key={key} defaultIndex={[0]} allowMultiple>
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
                      <Box
                        display="flex"
                        flexDir="column"
                        alignItems="start"
                        gap="8px"
                      >
                        <Text
                          fontFamily="heading"
                          fontSize="title.md"
                          fontWeight="semibold"
                        >
                          {key.includes(",") ? t(`mixed${tag}`) : t(key)}
                        </Text>
                        <Text
                          color="content.tertiary"
                          letterSpacing="wide"
                          fontSize="body.md"
                        >
                          {activityGroups[key]?.length} {t("activities-added")}
                        </Text>
                      </Box>
                      {/*Todo find a way to sum all consumptions regardless of their units*/}
                      {/*<Box*/}
                      {/*  alignItems="start"*/}
                      {/*  display="flex"*/}
                      {/*  fontFamily="heading"*/}
                      {/*>*/}
                      {/*  <Text fontWeight="medium">{t(title)}:&nbsp;</Text>*/}
                      {/*  <Text fontWeight="normal">0M gallons</Text>*/}
                      {/*</Box>*/}
                      <Box display="flex" alignItems="center" gap="6">
                        <Box
                          alignItems="start"
                          display="flex"
                          fontFamily="heading"
                        >
                          <Text fontWeight="medium">
                            {t("emissions")}:&nbsp;
                          </Text>
                          <Text fontWeight="normal">
                            {" "}
                            {convertKgToTonnes(
                              activityGroups[key]?.reduce(
                                (acc, curr) =>
                                  acc + BigInt(curr.co2eq as bigint),
                                0n,
                              ),
                            )}{" "}
                          </Text>
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
                            icon={
                              <AddIcon
                                color="interactive.control"
                                fontSize="24px"
                              />
                            }
                          />
                        </Box>
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
                  {renderTable(activityGroups[key])}
                </AccordionPanel>
              </AccordionItem>
            </Accordion>
          ))
      ) : (
        <Box
          borderTopRadius="md"
          borderColor="border.overlay"
          borderWidth={1}
          marginBottom="7"
          overflow="hidden"
        >
          {renderTable(activityData as ActivityValue[])}
        </Box>
      )}
    </>
  );
};

export default ActivityAccordion;
