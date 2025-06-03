import {
  api,
  useGetCityPopulationQuery,
  useGetOCCityDataQuery,
} from "@/services/api";
import { useMemo } from "react";
import ProgressLoader from "@/components/ProgressLoader";
import {
  Box,
  Heading,
  HStack,
  Icon,
  IconButton,
  Text,
  Separator,
  Grid,
} from "@chakra-ui/react";
import { SegmentedProgress } from "@/components/SegmentedProgress";
import {
  clamp,
  formatPercent,
  getShortenNumberUnit,
  shortenNumber,
} from "@/util/helpers";
import { Trans } from "react-i18next/TransWithoutContext";
import { TFunction } from "i18next";
import DownloadButton from "@/components/HomePage/DownloadButton";
import { CityResponse } from "@/util/types";
import { BsDownload } from "react-icons/bs";
import { formatEmissions } from "@/util/helpers";
import { MdArrowOutward, MdGroup, MdOutlineAspectRatio } from "react-icons/md";
import { useSession } from "next-auth/react";
import MyFilesTab from "@/components/Tabs/my-files-tab";
import FilesTable from "@/components/Files/fileTable";

interface InventoryViewProps {
  inventoryId: string;
  cityLocode: string;
  inventoryYear: number;
  cityId: string;
  t: TFunction;
  city: CityResponse;
  lng: string;
}

const InventoryView = ({
  inventoryId,
  cityLocode,
  inventoryYear,
  cityId,
  t,
  city,
  lng,
}: InventoryViewProps) => {
  const { data: inventory, isLoading: isInventoryLoading } =
    api.useGetInventoryQuery((inventoryId as string) || "default");

  const { data: cityData, isLoading: isCityDataLoading } =
    useGetOCCityDataQuery(cityLocode, {
      skip: !cityLocode,
    });

  const { data: population, isLoading: isPopulationLoading } =
    useGetCityPopulationQuery(
      { cityId: cityId!, year: inventoryYear! },
      { skip: !cityId || !inventoryYear },
    );

  const popWithDS = useMemo(
    () =>
      cityData?.population?.find(
        (p: { population: number; year: number }) =>
          p.population === population?.population &&
          p.year === population?.year,
      ),
    [cityData?.population, population?.population, population?.year],
  );

  const { data: inventoryProgress, isLoading: isInventoryProgressLoading } =
    api.useGetInventoryProgressQuery(inventoryId);

  const progressDetails = useMemo<{
    totalProgress: number;
    thirdPartyProgress: number;
    uploadedProgress: number;
  }>(() => {
    let totalProgress = 0,
      thirdPartyProgress = 0,
      uploadedProgress = 0;
    if (inventoryProgress && inventoryProgress.totalProgress.total > 0) {
      const { uploaded, thirdParty, total } = inventoryProgress.totalProgress;
      totalProgress = clamp((uploaded + thirdParty) / total);
      thirdPartyProgress = clamp(thirdParty / total);
      uploadedProgress = clamp(uploaded / total);
    }

    return {
      totalProgress,
      uploadedProgress,
      thirdPartyProgress,
    };
  }, [inventoryProgress]);

  const formattedEmissions = inventory?.totalEmissions
    ? formatEmissions(inventory.totalEmissions)
    : { value: t("N/A"), unit: "" };

  const { data: session, status } = useSession();

  const { data: userFiles } = api.useGetUserFilesQuery(cityId!, {
    skip: !cityId,
  });

  function getYearFromDate(dateString: string) {
    return new Date(dateString).getFullYear();
  }

  function filterDataByYear(
    data: any,
    selectedYear: number | null | undefined,
  ) {
    return data?.filter((item: any) => {
      return getYearFromDate(item?.lastUpdated) === selectedYear;
    });
  }

  const filteredData = filterDataByYear(userFiles, inventoryYear);

  if (
    isInventoryLoading ||
    isCityDataLoading ||
    isPopulationLoading ||
    isInventoryProgressLoading
  )
    return <ProgressLoader />;

  return (
    <Box mt={6}>
      <Text color="content.secondary" fontWeight="bold">
        {t("year-inventory_status", {
          year: inventoryYear,
        })}
      </Text>
      <Box
        className="flex w-full justify-between items-center mt-2 gap-6"
        mt={8}
        mb={8}
      >
        <SegmentedProgress
          values={[
            progressDetails.thirdPartyProgress,
            progressDetails.uploadedProgress,
          ]}
          colors={["interactive.connected", "interactive.tertiary"]}
        />
        <Heading
          fontWeight="semibold"
          fontSize="body.md"
          className="whitespace-nowrap"
        >
          {formatPercent(progressDetails.totalProgress)}%{" "}
          <Trans t={t}>completed</Trans>
        </Heading>
      </Box>
      <Separator borderColor="border.overlay" />
      <HStack justifyContent="space-between" mt={8}>
        <Text color="content.secondary" fontWeight="bold">
          {t("ghg-emissions-inventory-year", {
            year: inventoryYear,
          })}
        </Text>
        <DownloadButton
          lng={lng}
          inventoryId={inventoryId}
          city={city}
          inventory={inventory}
        >
          <HStack>
            <IconButton
              data-testid="download-inventory-icon"
              aria-label="download-inventory"
              color="interactive.secondary"
              variant="ghost"
            >
              <HStack gap={2} px={2}>
                <Icon as={BsDownload} size="lg" />
                <Text color="interactive.secondary">
                  {t("download-inventory")}
                </Text>
              </HStack>
            </IconButton>
          </HStack>
        </DownloadButton>
      </HStack>
      <HStack gap={6} w="full" mt={6} mb={6}>
        <Box
          flex={1}
          borderStyle="solid"
          borderColor="border.overlay"
          borderWidth={1}
          borderRadius={4}
          p={4}
        >
          <HStack flexDirection="column" alignItems="flex-start">
            <HStack justifyContent="flex-start">
              <Icon
                as={MdArrowOutward}
                boxSize={6}
                fill="sentiment.negativeDefault"
              />
              <HStack>
                <Text fontSize="headline.sm" fontWeight="bold">
                  {formattedEmissions.value}
                </Text>
                <Text fontSize="title.md">
                  {formattedEmissions.unit} {"Co2e"}
                </Text>
              </HStack>
            </HStack>
            <Text fontSize="body.md" color="content.tertiary">
              {t("total-ghg-inventory")}
            </Text>
          </HStack>
        </Box>
        <Box
          flex={1}
          borderStyle="solid"
          borderColor="border.overlay"
          borderWidth={1}
          borderRadius={4}
          p={4}
        >
          <HStack flexDirection="column" alignItems="flex-start">
            <HStack justifyContent="flex-start">
              <Icon as={MdGroup} boxSize={6} fill="background.overlay" />
              {population?.population ? (
                <Text
                  fontFamily="heading"
                  color="content.secondary"
                  fontSize="headline.sm"
                  fontWeight="semibold"
                  lineHeight="32"
                >
                  {shortenNumber(population.population)}
                  <span className="text-[16px]">
                    {population?.population
                      ? getShortenNumberUnit(population.population)
                      : ""}
                  </span>
                </Text>
              ) : (
                <Text
                  fontFamily="heading"
                  color="content.secondary"
                  fontSize="headline.sm"
                  fontWeight="semibold"
                  lineHeight="32"
                >
                  {t("N/A")}
                </Text>
              )}
            </HStack>
            <Text fontSize="body.md" color="content.tertiary">
              {t("total-population")}
            </Text>
          </HStack>
        </Box>
        <Box
          flex={1}
          borderStyle="solid"
          borderColor="border.overlay"
          borderWidth={1}
          borderRadius={4}
          p={4}
        >
          <HStack flexDirection="column" alignItems="flex-start">
            <HStack justifyContent="flex-start">
              <Icon
                as={MdOutlineAspectRatio}
                boxSize={6}
                fill="background.overlay"
              />
              <Box className="flex gap-1">
                {inventory?.city.area === null ||
                inventory?.city.area! === 0 ? (
                  <Text
                    fontFamily="heading"
                    color="border.neutral"
                    fontSize="headline.sm"
                    fontWeight="semibold"
                    lineHeight="32"
                  >
                    {t("n-a")}
                  </Text>
                ) : (
                  <Text
                    fontFamily="heading"
                    color="content.secondary"
                    fontSize="headline.sm"
                    fontWeight="semibold"
                    lineHeight="32"
                  >
                    {Math.round(inventory?.city.area!).toLocaleString()}
                    {/* eslint-disable-next-line i18next/no-literal-string */}
                    <span className="text-[16px]">
                      km<sup>2</sup>
                    </span>
                  </Text>
                )}
              </Box>
            </HStack>
            <Text fontSize="body.md" color="content.tertiary">
              {t("total-land-area")}
            </Text>
          </HStack>
        </Box>
      </HStack>
      <Separator borderColor="border.overlay" />
      <Box mt={6}>
        <Text
          fontSize="title.md"
          fontWeight="bold"
          color="content.secondary"
          mb={6}
        >
          {t("files-uploaded")}
        </Text>
        <FilesTable t={t} files={filteredData} />
      </Box>
    </Box>
  );
};

export default InventoryView;
