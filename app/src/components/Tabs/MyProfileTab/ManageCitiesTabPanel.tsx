import { FC, useState } from "react";
import {
  Box,
  Button,
  Icon,
  IconButton,
  Input,
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
  MdSearch,
} from "react-icons/md";
import { FiTrash2 } from "react-icons/fi";
import NextLink from "next/link";
import { useParams } from "next/navigation";
import { TFunction } from "i18next";
import { api } from "@/services/api";
import DeleteCityModal from "@/components/Modals/delete-city-modal";
import { CityAttributes } from "@/models/City";
import { PopoverRoot } from "@/components/ui/popover";
import { InputGroup } from "@/components/ui/input-group";
import { useFuzzySearch } from "@/hooks/useFuzzySearch";
import { Toaster, toaster } from "@/components/ui/toaster";
import { logger } from "@/services/logger";
import { CityYearData } from "@/util/types";

interface ManageCitiesProps {
  t: TFunction;
}

const ManageCitiesTabPanel: FC<ManageCitiesProps> = ({ t }) => {
  const { lng } = useParams();
  const { data: citiesAndYears, isLoading: isCitiesLoading } =
    api.useGetCitiesAndYearsQuery();

  const {
    open: isCityDeleteModalOpen,
    onOpen: onCityDeleteModalOpen,
    onClose: onCityDeleteModalClose,
  } = useDisclosure();
  const [cityData, setCityData] = useState<CityAttributes>();
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  const getLatestInventoryId = (years: CityYearData[]): string | null => {
    if (!years || years.length === 0) return null;
    const latestYear = years.reduce((latest, current) =>
      current.year > latest.year ? current : latest
    );
    return latestYear.inventoryId;
  };

  const handleDownloadECRF = async (
    cityId: string,
    cityLocode: string,
    years: CityYearData[],
  ) => {
    const inventoryId = getLatestInventoryId(years);
    if (!inventoryId) {
      toaster.create({
        description: t("no-inventory-data"),
        type: "error",
        duration: 3000,
      });
      return;
    }

    const latestYear = years.reduce((latest, current) =>
      current.year > latest.year ? current : latest
    );

    setIsDownloading(cityId);
    toaster.create({
      description: t("preparing-download"),
      type: "info",
      duration: 60000,
    });

    try {
      const res = await fetch(
        `/api/v1/inventory/${inventoryId}/download?format=ecrf&lng=${lng}`,
      );

      if (!res.ok) {
        throw new Error("Network response was not ok");
      }

      const contentDisposition = res.headers.get("Content-Disposition");
      const blob = await res.blob();

      let filename = `${cityLocode}_${latestYear.year}.xlsx`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) {
          filename = match[1];
        }
      }

      const downloadLink = document.createElement("a");
      downloadLink.href = URL.createObjectURL(blob);
      downloadLink.download = filename;
      downloadLink.click();

      toaster.dismiss();
      toaster.create({
        description: t("download-complete"),
        type: "success",
        duration: 3000,
      });

      URL.revokeObjectURL(downloadLink.href);
      downloadLink.remove();
    } catch (error) {
      logger.error({ err: error, cityId, inventoryId }, "Failed to download ECRF");
      toaster.dismiss();
      toaster.create({
        description: t("download-failed"),
        type: "error",
        duration: 3000,
      });
    } finally {
      setIsDownloading(null);
    }
  };

  // Use fuzzy search hook
  const filteredCitiesAndYears = useFuzzySearch({
    data: citiesAndYears || [],
    keys: ["city.name", "city.region", "city.country"],
    searchTerm,
    threshold: 0.3,
  });

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
      <Box display="flex" gap="24px">
        <InputGroup
          w="365px"
          height="48px"
          shadow="1dp"
          alignItems="center"
          display="flex"
          borderRadius="4px"
          borderWidth="1px"
          borderStyle="solid"
          borderColor="border.neutral"
          startElement={
            <Icon
              as={MdSearch}
              color="content.tertiary"
              display="flex"
              pointerEvents="none"
              alignItems="center"
              size="md"
            />
          }
        >
          <Input
            type="search"
            fontSize="body.md"
            fontFamily="heading"
            letterSpacing="wide"
            color="content.tertiary"
            placeholder={t("search-by-city-or-country")}
            border="none"
            h="100%"
            onChange={(e) => setSearchTerm(e.target.value)}
            value={searchTerm}
          />
        </InputGroup>
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
            {filteredCitiesAndYears?.map(({ city, years }) => (
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
                      h="64px"
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
                            cursor={isDownloading === city.cityId ? "wait" : "pointer"}
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
                            onClick={() => {
                              if (isDownloading !== city.cityId) {
                                handleDownloadECRF(
                                  city.cityId,
                                  city.locode || city.name || "city",
                                  years,
                                );
                              }
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
                              {isDownloading === city.cityId
                                ? t("downloading")
                                : t("download-city-data")}
                            </Text>
                          </List.Item>
                          {/* <List.Item
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
                          </List.Item> */}
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
      <Toaster />
    </>
  );
};

export default ManageCitiesTabPanel;
