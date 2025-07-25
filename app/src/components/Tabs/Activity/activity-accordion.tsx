import { ActivityValue } from "@/models/ActivityValue";
import { convertKgToTonnes } from "@/util/helpers";
import { Box, Icon, IconButton, Table, TagLabel, Text } from "@chakra-ui/react";
import { TFunction } from "i18next";
import React, { FC, useMemo } from "react";
import { MdAdd, MdModeEditOutline, MdMoreVert } from "react-icons/md";
import { FiTrash2 } from "react-icons/fi";
import { ExtraField, findMethodology, Methodology } from "@/util/form-schema";
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
import { useOrganizationContext } from "@/hooks/organization-context-provider/use-organizational-context";

interface IActivityGroup {
  activityData: ActivityValue[];
  extraFields: ExtraField[];
  groupBy: string | undefined;
  sourceField: string | undefined;
  filteredFields: ExtraField[];
  title: string;
  tag: string;
}

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
  const { lng } = useParams();
  // perform the group by logic when there's more than one activity.
  // split the data into groups
  // for each table group by the group by field

  const { isFrozenCheck } = useOrganizationContext();
  const methodology = findMethodology(methodologyId!, referenceNumber);

  const { activityGroups } = useMemo<{
    activityGroups: Record<string, IActivityGroup>;
  }>(() => {
    if (methodology?.activitySelectionField) {
      // create a map of everything else except activityData
      const activityGroups = methodology.activities?.reduce(
        (acc, curr) => {
          let key = curr.activitySelectedOption as string;
          acc[key] = {
            activityData: activityData?.filter(
              (activity) =>
                activity?.metadata?.[
                  methodology?.activitySelectionField?.id as string
                ] === key,
            ) as ActivityValue[],
            extraFields: curr["extra-fields"] as ExtraField[],
            groupBy: curr["group-by"],
            sourceField: curr["extra-fields"]?.find(
              (f) => f.id.includes("-source") && f.type === "text",
            )?.id,
            filteredFields: curr["extra-fields"]?.filter(
              (f) => !f.id.includes(curr["group-by"] as string),
            ) as ExtraField[],
            title: curr["activity-title"] as string,
            tag: "",
          };
          return acc;
        },
        {} as Record<string, IActivityGroup>,
      );

      return {
        activityGroups,
      };
    }

    let groupBy = methodology?.activities?.[0]["group-by"];
    let extraFields = (methodology as Methodology)?.activities?.[0]?.[
      "extra-fields"
    ] as ExtraField[];

    const sourceField = extraFields.find(
      (f) => f.id.includes("-source") && f.type === "text",
    )?.id;

    const filteredFields = extraFields.filter(
      (f) => !f.id.includes(groupBy as string),
    );

    const title = methodology?.activities?.[0]["activity-title"] as string;
    const tag = referenceNumber.includes("II") ? "-transport-types" : "";
    let activityGroups = null;
    if (!groupBy) {
      activityGroups = {
        "default-key": {
          activityData,
          extraFields,
          sourceField,
          filteredFields,
          title,
          tag,
        },
      };
    } else {
      activityGroups = activityData?.reduce((acc: any, activity: any) => {
        // TODO extend for groupby with multiple values
        const key = activity.activityData[groupBy];
        if (!acc[key]) {
          acc[key] = {
            activityData: [],
            extraFields,
            sourceField,
            filteredFields,
            title,
            tag,
          };
        }
        acc[key].activityData.push(activity);
        return acc;
      }, {});
    }
    return {
      activityGroups,
    };
  }, [activityData, methodology, referenceNumber]);

  // let extraFields = (methodology as Methodology)?.activities?.[0]?.[
  //   "extra-fields"
  // ] as ExtraField[];
  //
  // let groupBy = methodology?.activities?.[0]["group-by"];
  // const title = methodology?.activities?.[0]["activity-title"] as string;
  // const tag = referenceNumber.includes("II") ? "-transport-types" : "";
  //
  // const activityGroups = useMemo<Record<string, ActivityValue[]>>(() => {
  //   if (!groupBy) return {};
  //   return activityData?.reduce((acc: any, activity: any) => {
  //     // TODO extend for groupby with multiple values
  //     const key = activity.activityData[groupBy];
  //     if (!acc[key]) {
  //       acc[key] = [];
  //     }
  //     acc[key].push(activity);
  //     return acc;
  //   }, {});
  // }, [activityData, groupBy]);
  //
  // const sourceField = extraFields.find(
  //   (f) => f.id.includes("-source") && f.type === "text",
  // )?.id;
  //
  // const filteredFields = extraFields.filter(
  //   (f) => !f.id.includes(groupBy as string),
  // );

  // if there is no groupBy, return the activityData as is a regular table.
  const renderTable = (
    list: ActivityValue[],
    filteredFields: ExtraField[],
    sourceField: string,
    title: string,
  ) => {
    return (
      <Table.Root
        px={0}
        variant="line"
        borderLeft="0px"
        borderBottom="0px"
        borderRight="0px"
        borderWidth="1px"
        borderRadius="20px"
      >
        <Table.Header
          backgroundColor="background.backgroundLight"
          fontWeight="bold"
        >
          <Table.Row>
            {filteredFields?.length! > 0 && (
              <Table.ColumnHeader
                title={t(filteredFields[0].id)}
                maxWidth="200px"
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
              fontWeight="bold"
              fontFamily="heading"
              textTransform="uppercase"
              fontSize="body.sm"
              color="content.secondary"
            >
              {t("data-quality")}
            </Table.ColumnHeader>
            <Table.ColumnHeader
              fontWeight="bold"
              fontFamily="heading"
              textTransform="uppercase"
              fontSize="body.sm"
              color="content.secondary"
            >
              {t(sourceField as string)}
            </Table.ColumnHeader>
            <Table.ColumnHeader
              fontWeight="bold"
              fontFamily="heading"
              textTransform="uppercase"
              fontSize="body.sm"
              color="content.secondary"
            >
              {t(title)}
            </Table.ColumnHeader>
            <Table.ColumnHeader
              fontWeight="bold"
              fontFamily="heading"
              textTransform="uppercase"
              fontSize="body.sm"
              color="content.secondary"
            >
              {t("emissions")}
            </Table.ColumnHeader>
            <Table.ColumnHeader
              fontWeight="bold"
              fontFamily="heading"
              textTransform="uppercase"
              fontSize="body.sm"
              color="content.secondary"
            ></Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {list?.map((activity: any, i: number) => {
            return (
              <Table.Row
                title={t(activity.activityData?.[filteredFields[0].id])}
                maxWidth="200px"
                key={i}
                truncate
              >
                {filteredFields?.length! > 0 && (
                  <Table.Cell>
                    {t(activity.activityData?.[filteredFields[0].id])}
                  </Table.Cell>
                )}
                <Table.Cell>
                  <Tag
                    size="lg"
                    variant="surface"
                    colorPalette={
                      activity?.metadata?.dataQuality === "high"
                        ? "green"
                        : activity?.metadata?.dataQuality === "medium"
                          ? "yellow"
                          : "red"
                    }
                    colorScheme="blue"
                    borderRadius="lg"
                  >
                    <TagLabel textTransform="capitalize">
                      {t(activity?.metadata?.dataQuality)}
                    </TagLabel>
                  </Tag>
                </Table.Cell>
                <Table.Cell maxWidth="100px" truncate>
                  {activity?.activityData[sourceField as string]}
                </Table.Cell>
                <Table.Cell>
                  {parseFloat(activity?.activityData[title])}{" "}
                  {t(activity?.activityData[title + "-unit"])}
                </Table.Cell>
                <Table.Cell>{convertKgToTonnes(activity?.co2eq)}</Table.Cell>
                <Table.Cell>
                  <MenuRoot>
                    <MenuTrigger asChild>
                      <IconButton
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
                        onClick={() =>
                          isFrozenCheck() ? null : onEditActivity(activity)
                        }
                      >
                        <Icon
                          _hover={{ color: "white" }}
                          color="interactive.control"
                          as={MdModeEditOutline}
                          h="24px"
                          w="24px"
                        />
                        <Text
                          _hover={{ color: "white" }}
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
                        className="group"
                        onClick={() =>
                          isFrozenCheck() ? null : onDeleteActivity(activity)
                        }
                      >
                        <Icon
                          _hover={{ color: "white" }}
                          color="sentiment.negativeDefault"
                          as={FiTrash2}
                          h="24px"
                          w="24px"
                        />
                        <Text
                          _hover={{ color: "white" }}
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
      {!("default-key" in activityGroups) ? (
        Object.keys(activityGroups)
          .sort()
          .map((key) => (
            <AccordionRoot
              key={key}
              defaultValue={["main"]}
              multiple={true}
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
                        {key.includes(",")
                          ? t(`mixed${activityGroups[key].tag}`)
                          : t(key)}
                      </Text>
                      <Text
                        color="content.tertiary"
                        letterSpacing="wide"
                        fontSize="body.md"
                      >
                        {activityGroups[key]?.activityData.length}{" "}
                        {t("activities-added")}
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
                        <Text fontWeight="medium">{t("emissions")}:&nbsp;</Text>
                        <Text fontWeight="normal">
                          {" "}
                          {convertKgToTonnes(
                            activityGroups[key].activityData?.reduce(
                              (acc, curr) => acc + BigInt(curr.co2eq as bigint),
                              0n,
                            ),
                            null,
                            REGIONALLOCALES[lng as string],
                          )}{" "}
                        </Text>
                      </Box>
                      <Box pr="56px">
                        <IconButton
                          bg="none"
                          pos="relative"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isFrozenCheck()) return;
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

                        <Text fontWeight="normal"> </Text>
                      </Box>
                    </Box>
                  </Box>
                </AccordionItemTrigger>

                <AccordionItemContent padding="0px" pb={4}>
                  {renderTable(
                    activityGroups[key].activityData as ActivityValue[],
                    activityGroups[key].filteredFields as ExtraField[],
                    activityGroups[key].sourceField as string,
                    activityGroups[key].title as string,
                  )}
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
          {renderTable(
            activityGroups["default-key"].activityData as ActivityValue[],
            activityGroups["default-key"].filteredFields as ExtraField[],
            activityGroups["default-key"].sourceField as string,
            activityGroups["default-key"].title as string,
          )}
        </Box>
      )}
    </>
  );
};

export default ActivityAccordion;
