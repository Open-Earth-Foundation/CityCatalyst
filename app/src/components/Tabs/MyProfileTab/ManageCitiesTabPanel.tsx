import { FC, useState } from "react";
import {
  Box,
  Button,
  IconButton,
  List,
  ListItem,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useDisclosure,
} from "@chakra-ui/react";
import { AddIcon } from "@chakra-ui/icons";
import { FiTrash2 } from "react-icons/fi";
import { MdDomain, MdMoreVert, MdOutlineFileDownload } from "react-icons/md";
import NextLink from "next/link";
import { TFunction } from "i18next";
import { api } from "@/services/api";
import DeleteCityModal from "@/components/Modals/delete-city-modal";
import { CityAttributes } from "@/models/City";

interface ManageCitiesProps {
  t: TFunction;
}

const ManageCitiesTabPanel: FC<ManageCitiesProps> = ({ t }) => {
  const { data: citiesAndYears, isLoading: isCitiesLoading } =
    api.useGetCitiesAndYearsQuery();

  const {
    isOpen: isCityDeleteModalOpen,
    onOpen: onCityDeleteModalOpen,
    onClose: onCityDeleteModalClose,
  } = useDisclosure();
  const [cityData, setCityData] = useState<CityAttributes>();

  return (
    <>
      <Box
        height="36px"
        display="flex"
        alignItems="center"
        justifyContent="space-between"
      >
        <Text
          fontSize="title.md"
          fontWeight="semibold"
          lineHeight="24px"
          color="content.secondary"
        >
          {t("city")}
        </Text>
        <NextLink href="/onboarding/setup">
          <Button
            aria-label="Add City"
            leftIcon={<AddIcon />}
            type="submit"
            h="48px"
            w="auto"
            gap="8px"
            paddingTop="16px"
            paddingBottom="16px"
            px="24px"
            letterSpacing="widest"
            textTransform="uppercase"
            fontWeight="semibold"
            fontSize="button.md"
          >
            {t("add-city")}
          </Button>
        </NextLink>
      </Box>
      <Box maxHeight="500px" overflow="scroll">
        <TableContainer
          borderWidth="1px"
          borderColor="border.overlay"
          borderRadius="12px"
        >
          <Table variant="simple" borderStyle="solid">
            <Thead>
              <Tr>
                <Th>{t("city-name")}</Th>
                <Th>{t("state-province")}</Th>
                <Th>{t("country")}</Th>
                <Th align="right">{t("last-updated")}</Th>
              </Tr>
            </Thead>
            <Tbody fontFamily="heading">
              {citiesAndYears?.map(({ city }) => (
                <Tr key={city.cityId}>
                  <Td>
                    <Box
                      color="interactive.secondary"
                      display="flex"
                      alignItems="center"
                      gap="10px"
                    >
                      <MdDomain size={24} />
                      <Text color="base.dark">{city.name}</Text>
                    </Box>
                  </Td>
                  <Td>{city.region}</Td>
                  <Td>{city.country}</Td>
                  <Td
                    display="flex"
                    alignItems="center"
                    gap="8px"
                    align="right"
                  >
                    <Text>
                      {city?.lastUpdated &&
                        new Date(city.lastUpdated).toLocaleDateString()}
                    </Text>
                    <Popover isLazy>
                      <PopoverTrigger>
                        <IconButton
                          aria-label="action-button"
                          variant="ghost"
                          color="interactive.control"
                          height="36px"
                          width="36px"
                          icon={<MdMoreVert size={24} />}
                        />
                      </PopoverTrigger>
                      <PopoverContent
                        h="128px"
                        w="300px"
                        borderRadius="8px"
                        shadow="2dp"
                        borderWidth="1px"
                        borderStyle="solid"
                        borderColor="border.neutral"
                        padding="10px"
                        px="0"
                      >
                        <PopoverArrow />
                        <PopoverBody padding="0">
                          <List padding="0">
                            <ListItem
                              className="group"
                              display="flex"
                              cursor="pointer"
                              gap="16px"
                              color="content.tertiary"
                              alignItems="center"
                              px="16px"
                              paddingTop="12px"
                              paddingBottom="12px"
                              _hover={{
                                background: "content.link",
                                color: "white",
                              }}
                            >
                              <MdOutlineFileDownload size={24} />
                              <Text
                                color="content.secondary"
                                fontFamily="heading"
                                letterSpacing="wide"
                                fontWeight="normal"
                                fontSize="body.lg"
                                className="group-hover:text-white"
                              >
                                {t("download-city-data")}
                              </Text>
                            </ListItem>
                            <ListItem
                              display="flex"
                              cursor="pointer"
                              gap="16px"
                              className="group"
                              color="sentiment.negativeDefault"
                              alignItems="center"
                              px="16px"
                              paddingTop="12px"
                              paddingBottom="12px"
                              _hover={{
                                background: "content.link",
                                color: "white",
                              }}
                              onClick={() => {
                                setCityData(city);
                                onCityDeleteModalOpen();
                              }}
                            >
                              <FiTrash2 size={24} />
                              <Text
                                color="content.secondary"
                                fontFamily="heading"
                                letterSpacing="wide"
                                fontWeight="normal"
                                fontSize="body.lg"
                                className="group-hover:text-white"
                              >
                                {t("remove-city")}
                              </Text>
                            </ListItem>
                          </List>
                        </PopoverBody>
                      </PopoverContent>
                    </Popover>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
      </Box>
      {!!cityData && (
        <DeleteCityModal
          isOpen={isCityDeleteModalOpen}
          onClose={onCityDeleteModalClose}
          cityData={cityData}
          t={t}
        />
      )}
    </>
  );
};

export default ManageCitiesTabPanel;
