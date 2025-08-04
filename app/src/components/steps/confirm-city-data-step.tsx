import { Box, Card, Heading, Icon, Text } from "@chakra-ui/react";
import { TFunction } from "i18next";
import dynamic from "next/dynamic";
import { CircleFlag } from "react-circle-flags";
import { MdOutlineAspectRatio } from "react-icons/md";
const CityMap = dynamic(() => import("@/components/CityMap"), { ssr: false });

export default function ConfirmStep({
  cityName,
  t,
  locode,
  area,
}: {
  cityName: String;
  t: TFunction;
  locode: string;
  area: number;
}) {
  return (
    <Box w="full">
      <Box display="flex" flexDir="column" gap="24px" mb={6}>
        <Heading data-testid="confirm-city-data-heading" size="lg">
          {t("confirm-heading")}
        </Heading>
        <Text fontSize="body.lg" color="content.tertiary">
          {t("confirm-description")}
        </Text>
      </Box>
      <Box w="full">
        <Card.Root
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
                      data-testid="confirm-city-data-area"
                    >
                      {area && area > 0 ? (
                        <>
                          {/* eslint-disable-next-line i18next/no-literal-string */}
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
        </Card.Root>
      </Box>
    </Box>
  );
}
