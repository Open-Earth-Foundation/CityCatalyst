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
        {activityData?.map((activity: any, i: number) => (
          <Tr key={i}>
            <Td>{t(activity?.activityDataJsonb.activityType)}</Td>
            <Td>
              <Tag>
                <TagLabel>{activity?.dataSource.dataQuality}</TagLabel>
              </Tag>
            </Td>
            <Td>{activity?.activityDataJsonb.co2_amount}</Td>
            <Td>{activity?.activityDataJsonb.n2o_amount}</Td>
            <Td>{activity?.activityDataJsonb.ch4_amount}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
};

export default DirectMeasureTable;
