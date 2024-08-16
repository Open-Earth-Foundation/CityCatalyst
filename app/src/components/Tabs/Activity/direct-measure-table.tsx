import { ActivityValue } from "@/models/ActivityValue";
import {
  Table,
  Tag,
  TagLabel,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import React, { FC } from "react";

interface DirectMeasureTableProps {
  t: TFunction;
  activityData: ActivityValue[] | undefined;
}

const DirectMeasureTable: FC<DirectMeasureTableProps> = ({
  activityData,
  t,
}) => {
  return (
    <Table variant="simple" borderWidth="1px" borderRadius="20px">
      <Thead>
        <Tr>
          <Th>{t("building-type")}</Th>
          <Th>{t("data-quality")}</Th>
          <Th>{t("co2-emissions")}</Th>
          <Th>{t("n2o-emissions")}</Th>
          <Th>{t("ch4-emissions")}</Th>
          <Th></Th>
        </Tr>
      </Thead>
      <Tbody>
        {activityData?.map((activity: any, i: number) => {
          const dataQuality = activity?.dataSource.dataQuality;
          let tagStyles = {
            bg: "",
            border: "",
            color: "",
          };
          switch (dataQuality) {
            case "low":
              tagStyles = {
                bg: "sentiment.warningOverlay",
                border: "sentiment.warningDefault",
                color: "sentiment.warningDefault",
              };
              break;
            case "medium":
              tagStyles = {
                bg: "background.neutral",
                border: "content.link",
                color: "content.link",
              };
              break;

            case "high":
              tagStyles = {
                bg: "sentiment.positiveOverlay",
                border: "interactive.tertiary",
                color: "interactive.tertiary",
              };
              break;

            default:
              break;
          }
          return (
            <Tr key={i}>
              <Td>{t(activity?.activityDataJsonb.activityType)}</Td>
              <Td>
                <Tag
                  p="8px"
                  minW="50px"
                  bg={tagStyles.bg}
                  borderWidth="1px"
                  borderColor={tagStyles.border}
                >
                  <TagLabel color={tagStyles.color} textTransform="capitalize">
                    {dataQuality}
                  </TagLabel>
                </Tag>
              </Td>
              <Td>{activity?.activityDataJsonb.co2_amount}</Td>
              <Td>{activity?.activityDataJsonb.n2o_amount}</Td>
              <Td>{activity?.activityDataJsonb.ch4_amount}</Td>
            </Tr>
          );
        })}
      </Tbody>
    </Table>
  );
};

export default DirectMeasureTable;
