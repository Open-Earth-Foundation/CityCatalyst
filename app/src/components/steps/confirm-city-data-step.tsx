import { CalendarIcon, DataFormatIcon } from "@/components/icons";
import { getShortenNumberUnit, shortenNumber } from "@/util/helpers";
import { Box, Card, Heading, Icon, Text } from "@chakra-ui/react";
import { TFunction } from "i18next";
import dynamic from "next/dynamic";
import { CircleFlag } from "react-circle-flags";
import { MdOutlineAspectRatio, MdOutlinePeopleAlt } from "react-icons/md";
const CityMap = dynamic(() => import("@/components/CityMap"), { ssr: false });

export default function ConfirmStep({
  cityName,
  t,
  locode,
  area,
  population,
  inventoryGoal,
  year,
}: {
  cityName: String;
  t: TFunction;
  locode: string;
  area: number;
  population?: number;
  inventoryGoal: string;
  year: number;
}) {
  return (
    <Box w="full">
      <Box display="flex" flexDir="column" gap="24px">
        <Heading data-testId="confirm-city-data-heading" size="lg">
          {t("confirm-heading")}
        </Heading>
        <Text fontSize="body.lg" color="content.tertiary">
          {t("confirm-description")}
        </Text>
      </Box>
      <Box w="full">
        <Card
          px={6}
          py={8}
          shadow="none"
          bg="none"
          w="full"
          flexDir="row"
          width="full"
          gap="24px"
        >
          <Box w="full" display="flex" flexDir="column">
            <Box display="flex" alignItems="center" gap="16px">
              <CircleFlag
                countryCode={locode?.substring(0, 2).toLowerCase() || ""}
                width={32}
              />
              <Heading
                fontSize="title.md"
                color="content.alternative"
                fontStyle="normal"
                lineHeight="24px"
                textOverflow="ellipsis"
                overflow="hidden"
              >
                {cityName}
              </Heading>
            </Box>
            <Box
              w="full"
              mt={12}
              display="flex"
              flexDir="column"
              justifyContent="space-between"
              gap="24px"
            >
              <Box
                borderBottomWidth="2px"
                borderColor="border.overlay"
                py="36px"
                w="full"
                display="flex"
                justifyContent="space-between"
              >
                <Box
                  display="flex"
                  alignItems="center"
                  h="44px"
                  gap="16px"
                  w="full"
                >
                  <Box h="full">
                    <Icon as={CalendarIcon} color="interactive.control" />
                  </Box>
                  <Box h="full">
                    <Text
                      fontSize="title.md"
                      fontWeight="600"
                      lineHeight="24px"
                      fontStyle="normal"
                      color="content.secondary"
                      fontFamily="heading"
                      data-testId="confirm-city-data-year"
                    >
                      {year}
                    </Text>
                    <Text
                      fontSize="label.md"
                      fontWeight="500"
                      lineHeight="16px"
                      fontStyle="normal"
                      color="content.tertiary"
                      letterSpacing="wide"
                    >
                      {t("inventory-year")}
                    </Text>
                  </Box>
                </Box>
                <Box
                  w="full"
                  display="flex"
                  alignItems="center"
                  h="44px"
                  gap="16px"
                >
                  <Box h="full">
                    <Icon as={DataFormatIcon} color="interactive.control" />
                  </Box>
                  <Box h="full">
                    <Text
                      fontSize="title.md"
                      fontWeight="600"
                      lineHeight="24px"
                      fontStyle="normal"
                      color="content.secondary"
                      fontFamily="heading"
                      data-testId="confirm-city-data-inventory-goal"
                    >
                      {t(inventoryGoal)}
                    </Text>
                    <Text
                      fontSize="label.md"
                      fontWeight="500"
                      lineHeight="16px"
                      fontStyle="normal"
                      color="content.tertiary"
                      letterSpacing="wide"
                    >
                      {t("inventory-format")}
                    </Text>
                  </Box>
                </Box>
              </Box>
              <Box
                borderBottomWidth="2px"
                borderColor="border.overlay"
                w="full"
                display="flex"
                py="36px"
              >
                <Box
                  w="full"
                  display="flex"
                  alignItems="center"
                  h="44px"
                  gap="16px"
                >
                  <Box h="full">
                    <Icon
                      h="24px"
                      w="24px"
                      as={MdOutlinePeopleAlt}
                      color="interactive.control"
                    />
                  </Box>
                  <Box h="full">
                    <Text
                      fontSize="title.md"
                      fontWeight="600"
                      lineHeight="24px"
                      fontStyle="normal"
                      color="content.secondary"
                      fontFamily="heading"
                      data-testId="confirm-city-data-population"
                    >
                      {population ? (
                        <>
                          {shortenNumber(population)}
                          {getShortenNumberUnit(population)}
                        </>
                      ) : (
                        "N/A"
                      )}
                    </Text>
                    <Text
                      fontSize="label.md"
                      fontWeight="500"
                      lineHeight="16px"
                      fontStyle="normal"
                      color="content.tertiary"
                      letterSpacing="wide"
                    >
                      {t("total-population")}
                    </Text>
                  </Box>
                </Box>
                <Box
                  w="full"
                  display="flex"
                  alignItems="center"
                  h="44px"
                  gap="16px"
                >
                  <Box h="full">
                    <Icon
                      as={MdOutlineAspectRatio}
                      color="interactive.control"
                      h="24px"
                      w="24px"
                    />
                  </Box>
                  <Box h="full">
                    <Text
                      fontSize="title.md"
                      fontWeight="600"
                      lineHeight="24px"
                      fontStyle="normal"
                      color="content.secondary"
                      fontFamily="heading"
                      data-testId="confirm-city-data-area"
                    >
                      {area && area > 0 ? (
                        <>
                          {" "}
                          {Math.round(area)}km<sup>2</sup>
                        </>
                      ) : (
                        "N/A"
                      )}
                    </Text>
                    <Text
                      fontSize="label.md"
                      fontWeight="500"
                      lineHeight="16px"
                      fontStyle="normal"
                      color="content.tertiary"
                      letterSpacing="wide"
                    >
                      {t("total-land-area")}
                    </Text>
                  </Box>
                </Box>
              </Box>
            </Box>
          </Box>
          <Box w="full">
            <CityMap locode={locode} height={400} width={450} />
          </Box>
        </Card>
      </Box>
    </Box>
  );
}
