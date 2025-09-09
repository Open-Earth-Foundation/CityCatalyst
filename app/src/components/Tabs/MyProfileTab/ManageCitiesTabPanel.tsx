import { FC, useState } from "react";
import {
  Box,
  Button,
  Icon,
  IconButton,
  List,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Table,
  Text,
  useDisclosure,
} from "@chakra-ui/react";
import {
  MdAdd,
  MdDomain,
  MdMoreVert,
  MdOutlineFileDownload,
} from "react-icons/md";
import { FiTrash2 } from "react-icons/fi";
import NextLink from "next/link";
import { TFunction } from "i18next";
import { api } from "@/services/api";
import DeleteCityModal from "@/components/Modals/delete-city-modal";
import { CityAttributes } from "@/models/City";
import { PopoverRoot } from "@/components/ui/popover";

interface ManageCitiesProps {
  t: TFunction;
}

const ManageCitiesTabPanel: FC<ManageCitiesProps> = ({ t }) => {
  const { data: citiesAndYears, isLoading: isCitiesLoading } =
    api.useGetCitiesAndYearsQuery();

  const {
    open: isCityDeleteModalOpen,
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
            <Icon as={MdAdd} />
            {t("add-city")}
          </Button>
        </NextLink>
      </Box>
      <Box maxHeight="500px" overflow="scroll">
        <Table.Root
          variant="outline"
          borderStyle="solid"
          borderWidth="1px"
          borderColor="border.overlay"
          borderRadius="12px"
        >
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>{t("city-name")}</Table.ColumnHeader>
              <Table.ColumnHeader>{t("state-province")}</Table.ColumnHeader>
              <Table.ColumnHeader>{t("country")}</Table.ColumnHeader>
              <Table.ColumnHeader align="right">
                {t("last-updated")}
              </Table.ColumnHeader>
              <Table.ColumnHeader />
            </Table.Row>
          </Table.Header>
          <Table.Body fontFamily="heading">
            {citiesAndYears?.map(({ city }) => (
              <Table.Row key={city.cityId}>
                <Table.Cell>
                  <Box
                    color="interactive.secondary"
                    display="flex"
                    alignItems="center"
                    gap="10px"
                  >
                    <MdDomain size={24} />
                    <Text color="base.dark">{city.name}</Text>
                  </Box>
                </Table.Cell>
                <Table.Cell>{city.region}</Table.Cell>
                <Table.Cell>{city.country}</Table.Cell>
                <Table.Cell
                  display="flex"
                  alignItems="center"
                  gap="8px"
                  align="right"
                >
                  <Text>
                    {city?.lastUpdated &&
                      new Date(city.lastUpdated).toLocaleDateString()}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <PopoverRoot>
                    <PopoverTrigger asChild>
                      <IconButton
                        aria-label="action-button"
                        variant="ghost"
                        color="interactive.control"
                        height="36px"
                        width="36px"
                      >
                        <MdMoreVert size={30} />
                      </IconButton>
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
                      pos="absolute"
                      right="0"
                    >
                      <PopoverBody padding="0">
                        <List.Root padding="0">
                          <List.Item
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
                              _groupHover={{ color: "white" }}
                              textTransform="capitalize"
                            >
                              {t("download-city-data")}
                            </Text>
                          </List.Item>
                          <List.Item
                            display="flex"
                            cursor="pointer"
                            gap="16px"
                            _groupHover={{}}
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
                              _groupHover={{ color: "white" }}
                            >
                              {t("remove-city")}
                            </Text>
                          </List.Item>
                        </List.Root>
                      </PopoverBody>
                    </PopoverContent>
                  </PopoverRoot>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
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
