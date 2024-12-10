import { ActivityValue } from "@/models/ActivityValue";
import { convertKgToTonnes } from "@/util/helpers";
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
import { FiTrash2 } from "react-icons/fi";
import { MdModeEditOutline, MdMoreVert } from "react-icons/md";
import {
  DirectMeasure,
  ExtraField,
  MANUAL_INPUT_HIERARCHY,
} from "@/util/form-schema";
import { AddIcon } from "@chakra-ui/icons";

interface DirectMeasureTableProps {
  t: TFunction;
  activityData: ActivityValue[] | undefined;
  onDeleteActivity: (activity: ActivityValue) => void;
  onEditActivity: (activity: ActivityValue) => void;
  referenceNumber?: string;
  showActivityModal: () => void;
}

const DirectMeasureTable: FC<DirectMeasureTableProps> = ({
  activityData,
  onDeleteActivity,
  onEditActivity,
  referenceNumber,
  t,
  showActivityModal,
}) => {
  const directMeasure = MANUAL_INPUT_HIERARCHY[referenceNumber as string]
    .directMeasure as DirectMeasure;
  const extraFields = directMeasure["extra-fields"] as ExtraField[];
  const tag = referenceNumber?.includes("II") ? "-transport-types" : "";

  let groupBy = directMeasure?.["group-by"] as string;

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

  const filteredFields = extraFields.filter((f) => {
    return !f.id.includes(groupBy as string);
  });

  const renderTable = (list: ActivityValue[]) => {
    return (
      <Table variant="simple" overflowX="scroll" borderWidth="1px">
        <Thead bg="background.backgroundLight">
          <Tr fontSize="button.sm" fontWeight="bold">
            {filteredFields.length > 0 && (
              <Th isTruncated>{t(filteredFields[0].id)}</Th>
            )}

            <Th isTruncated>{t("data-quality")}</Th>
            <Th isTruncated>{t(sourceField as string)}</Th>
            <Th isNumeric isTruncated>
              {t("co2-emissions")}
            </Th>
            <Th isNumeric isTruncated>
              {t("n2o-emissions")}
            </Th>
            <Th isNumeric isTruncated>
              {t("ch4-emissions")}
            </Th>
            <Th></Th>
          </Tr>
        </Thead>
        <Tbody>
          {list?.map((activity: ActivityValue, i: number) => {
            const dataQuality = activity?.metadata?.dataQuality;
            return (
              <Tr key={i}>
                {filteredFields.length > 0 && (
                  <Td
                    title={t(activity?.activityData?.[filteredFields[0].id])}
                    isTruncated
                    maxWidth="200px"
                  >
                    {t(activity?.activityData?.[filteredFields[0].id])}
                  </Td>
                )}
                <Td>
                  <Tag p="8px" minW="50px" variant={dataQuality}>
                    <TagLabel textTransform="capitalize">
                      {t(dataQuality!)}
                    </TagLabel>
                  </Tag>
                </Td>
                <Td>
                  <Text maxWidth="100px" isTruncated>
                    {activity?.activityData?.[sourceField as string]}
                  </Text>
                </Td>
                <Td isNumeric isTruncated>
                  {/*Direct measure entries are collected in tonnes by default*/}
                  {convertKgToTonnes(
                    activity?.activityData?.co2_amount * 1000,
                    "CO2e",
                  )}
                </Td>
                <Td isNumeric isTruncated>
                  {convertKgToTonnes(
                    activity?.activityData?.n2o_amount * 1000,
                    "N2O",
                  )}
                </Td>
                <Td isNumeric isTruncated>
                  {convertKgToTonnes(
                    activity?.activityData?.ch4_amount * 1000,
                    "CH4",
                  )}
                </Td>
                <Td>
                  <Popover>
                    <PopoverTrigger>
                      <IconButton
                        data-testid="activity-more-icon"
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
                          data-testid="delete-activity-button"
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
                <AccordionPanel padding="0px" pb={4} overflowX="scroll">
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

export default DirectMeasureTable;
