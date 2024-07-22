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
} from "@chakra-ui/react";
import { TFunction } from "i18next";
import React, { FC } from "react";
import { MdMoreVert } from "react-icons/md";

interface ActivityAccordionProps {
  t: TFunction;
  userActivities: any;
  showActivityModal: () => void;
}

const ActivityAccordion: FC<ActivityAccordionProps> = ({
  t,
  userActivities,
  showActivityModal,
}) => {
  return (
    <Accordion defaultIndex={[0]} allowMultiple>
      <AccordionItem>
        <h2>
          <AccordionButton>
            <Box
              display="flex"
              justifyContent="space-between"
              w="full"
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
                  {userActivities?.length} {t("activities-added")}
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
                  zIndex={20}
                  onClick={showActivityModal}
                  _hover={{ bg: "none" }}
                  aria-label="add-activity"
                  icon={<AddIcon color="interactive.control" fontSize="24px" />}
                />
              </Box>
            </Box>
            <AccordionIcon
              color="interactive.control"
              style={{ fontSize: "40px" }}
            />
          </AccordionButton>
        </h2>
        <AccordionPanel pb={4}>
          <TableContainer>
            <Table variant="simple" borderWidth="1px" borderRadius="20px">
              <Thead>
                <Tr>
                  <Th>{t("fuel-type")}</Th>
                  <Th>{t("data-quality")}</Th>
                  <Th>{t("fuel-consumption")}</Th>
                  <Th>{t("emissions")}</Th>
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody>
                {userActivities?.map((activity: any, i: number) => {
                  return (
                    <Tr key={i}>
                      <Td>{activity?.fuelType}</Td>
                      <Td>
                        <Tag
                          size="lg"
                          variant="outline"
                          colorScheme="blue"
                          borderRadius="full"
                        >
                          <TagLabel>{activity?.dataQuality}</TagLabel>
                        </Tag>
                      </Td>
                      <Td>{activity?.fuelConsumption!}</Td>
                      <Td>{activity?.emissions}</Td>
                      <Td>
                        <IconButton
                          color="interactive.control"
                          variant="ghost"
                          aria-label="activity-data-popover"
                          icon={<MdMoreVert size="24px" />}
                        />
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
