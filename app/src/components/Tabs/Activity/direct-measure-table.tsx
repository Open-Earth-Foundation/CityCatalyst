import { ActivityValue } from "@/models/ActivityValue";
import { convertKgToTonnes } from "@/util/helpers";
import { Box, Icon, IconButton, Table, TagLabel, Text } from "@chakra-ui/react";
import { TFunction } from "i18next";
import React, { FC, useMemo } from "react";
import { FiTrash2 } from "react-icons/fi";
import { MdAdd, MdModeEditOutline, MdMoreVert } from "react-icons/md";
import {
  DirectMeasure,
  ExtraField,
  MANUAL_INPUT_HIERARCHY,
} from "@/util/form-schema";
import { Tag } from "@/components/ui/tag";
import {
  AccordionItem,
  AccordionItemContent,
  AccordionItemTrigger,
  AccordionRoot,
} from "@/components/ui/accordion";
import { useParams } from "next/navigation";
import { REGIONALLOCALES } from "@/util/constants";
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from "@/components/ui/menu";

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
  const { lng } = useParams();
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
      <Table.Root variant="outline" overflowX="scroll" borderWidth="1px">
        <Table.Header bg="background.backgroundLight">
          <Table.Row>
            {filteredFields.length > 0 && (
              <Table.ColumnHeader
                truncate
                fontWeight="bold"
                fontFamily="heading"
                textTransform="uppercase"
                fontSize="body.sm"
                color="content.secondary"
              >
                {t(filteredFields[0].id)}
              </Table.ColumnHeader>
            )}

            <Table.ColumnHeader
              truncate
              fontWeight="bold"
              fontFamily="heading"
              textTransform="uppercase"
              fontSize="body.sm"
              color="content.secondary"
            >
              {t("data-quality")}
            </Table.ColumnHeader>
            <Table.ColumnHeader
              truncate
              fontWeight="bold"
              fontFamily="heading"
              textTransform="uppercase"
              fontSize="body.sm"
              color="content.secondary"
            >
              {t(sourceField as string)}
            </Table.ColumnHeader>
            <Table.ColumnHeader
              textAlign="end"
              truncate
              fontWeight="bold"
              fontFamily="heading"
              textTransform="uppercase"
              fontSize="body.sm"
              color="content.secondary"
            >
              {t("co2-emissions")}
            </Table.ColumnHeader>
            <Table.ColumnHeader
              textAlign="end"
              truncate
              fontWeight="bold"
              fontFamily="heading"
              textTransform="uppercase"
              fontSize="body.sm"
              color="content.secondary"
            >
              {t("n2o-emissions")}
            </Table.ColumnHeader>
            <Table.ColumnHeader
              textAlign="end"
              truncate
              fontWeight="bold"
              fontFamily="heading"
              textTransform="uppercase"
              fontSize="body.sm"
              color="content.secondary"
            >
              {t("ch4-emissions")}
            </Table.ColumnHeader>
            <Table.ColumnHeader></Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {list?.map((activity: ActivityValue, i: number) => {
            const dataQuality = activity?.metadata?.dataQuality;
            return (
              <Table.Row key={i} fontSize="body.md">
                {filteredFields.length > 0 && (
                  <Table.Cell
                    title={t(activity?.activityData?.[filteredFields[0].id])}
                    truncate
                    maxWidth="200px"
                  >
                    {t(activity?.activityData?.[filteredFields[0].id])}
                  </Table.Cell>
                )}
                <Table.Cell>
                  <Tag
                    p="8px"
                    minW="50px"
                    variant="surface"
                    colorPalette={
                      activity?.metadata?.dataQuality === "high"
                        ? "green"
                        : activity?.metadata?.dataQuality === "medium"
                          ? "yellow"
                          : "blue"
                    }
                  >
                    <TagLabel textTransform="capitalize">
                      {t(dataQuality!)}
                    </TagLabel>
                  </Tag>
                </Table.Cell>
                <Table.Cell>
                  <Text maxWidth="100px" truncate>
                    {activity?.activityData?.[sourceField as string]}
                  </Text>
                </Table.Cell>
                <Table.Cell textAlign="end" truncate>
                  {/*Direct measure entries are collected in tonnes by default*/}
                  {convertKgToTonnes(
                    activity?.activityData?.co2_amount * 1000,
                    "CO2e",
                    REGIONALLOCALES[lng as string],
                  )}
                </Table.Cell>
                <Table.Cell textAlign="end" truncate>
                  {convertKgToTonnes(
                    activity?.activityData?.n2o_amount * 1000,
                    "N2O",
                    REGIONALLOCALES[lng as string],
                  )}
                </Table.Cell>
                <Table.Cell textAlign="end" truncate>
                  {convertKgToTonnes(
                    activity?.activityData?.ch4_amount * 1000,
                    "CH4",
                    REGIONALLOCALES[lng as string],
                  )}
                </Table.Cell>
                <Table.Cell>
                  <MenuRoot>
                    <MenuTrigger>
                      <IconButton
                        data-testid="activity-more-icon"
                        aria-label="more-icon"
                        variant="ghost"
                        color="content.tertiary"
                      >
                        <Icon as={MdMoreVert} size="lg" />
                      </IconButton>
                    </MenuTrigger>
                    <MenuContent
                      w="auto"
                      borderRadius="8px"
                      shadow="2dp"
                      px="0"
                    >
                      <MenuItem
                        value={t("update-activity")}
                        valueText={t("update-activity")}
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
                      </MenuItem>
                      <MenuItem
                        value={t("delete-activity")}
                        valueText={t("delete-activity")}
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
                      </MenuItem>
                    </MenuContent>
                  </MenuRoot>
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>
    );
  };

  return (
    <>
      {!!groupBy ? (
        Object.keys(activityGroups)
          .sort()
          .map((key) => (
            <AccordionRoot
              key={key}
              defaultValue={["main"]}
              multiple
              collapsible
            >
              <AccordionItem
                value="main"
                backgroundColor="white"
                borderWidth="1px"
                padding="0px"
                borderColor="border.overlay"
              >
                <AccordionItemTrigger padding="0px">
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
                        <Text fontWeight="medium">{t("emissions")}:&nbsp;</Text>
                        <Text fontWeight="normal">
                          {" "}
                          {convertKgToTonnes(
                            activityGroups[key]?.reduce(
                              (acc, curr) => acc + BigInt(curr.co2eq as bigint),
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
                        >
                          <Icon
                            as={MdAdd}
                            color="interactive.control"
                            size="2xl"
                          />
                        </IconButton>
                      </Box>
                    </Box>
                  </Box>
                </AccordionItemTrigger>
                <AccordionItemContent padding="0px" pb={4} overflowX="scroll">
                  {renderTable(activityGroups[key])}
                </AccordionItemContent>
              </AccordionItem>
            </AccordionRoot>
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
