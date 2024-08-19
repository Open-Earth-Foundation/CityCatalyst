import { ActivityValue } from "@/models/ActivityValue";
import { EditIcon } from "@chakra-ui/icons";
import {
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
import React, { FC } from "react";
import { FiTrash2 } from "react-icons/fi";
import { MdModeEditOutline, MdMoreVert } from "react-icons/md";

interface DirectMeasureTableProps {
  t: TFunction;
  activityData: ActivityValue[] | undefined;
}

const DirectMeasureTable: FC<DirectMeasureTableProps> = ({
  activityData,
  t,
}) => {
  return (
    <Box>
      <Table variant="simple" borderWidth="1px">
        <Thead bg="background.backgroundLight">
          <Tr fontSize="button.sm" fontWeight="bold">
            <Th isTruncated>{t("building-type")}</Th>
            <Th isTruncated>{t("data-quality")}</Th>
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
          {activityData?.map((activity: ActivityValue, i: number) => {
            const dataQuality = activity?.dataSource?.dataQuality;
            return (
              <Tr key={i}>
                <Td isTruncated>{t(activity?.activityData?.activity_type!)}</Td>
                <Td>
                  <Tag p="8px" minW="50px" variant={dataQuality}>
                    <TagLabel textTransform="capitalize">
                      {dataQuality}
                    </TagLabel>
                  </Tag>
                </Td>
                <Td isNumeric isTruncated>
                  {activity?.activityData?.co2_amount} tCO2
                </Td>
                <Td isNumeric isTruncated>
                  {activity?.activityData?.n2o_amount} tN2Oe
                </Td>
                <Td isNumeric isTruncated>
                  {activity?.activityData?.ch4_amount} tCH4e
                </Td>
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
    </Box>
  );
};

export default DirectMeasureTable;
