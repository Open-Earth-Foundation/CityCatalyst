import { Box, Text } from "@chakra-ui/react";
import { TFunction } from "i18next";
import React from "react";

const RecentSearches = ({ t }: { t: TFunction }) => {
  const data = [
    {
      id: 1,
      name: "Rio de Janeiro",
      path: "Brazil {" > "} Rio de Janeiro",
    },
    {
      id: 2,
      name: "Brisbane",
      path: "Australia {" > "} Queensland",
    },
    {
      id: 3,
      name: "Ciudad Autónoma de Buenos Aires",
      path: "Argentina {" > "} Capital Federal",
    },
  ];
  const hasRecentSearches = false;
  return (
    <Box>
      <Box px={4}>
        <Text
          color="content.tertiary"
          fontWeight="extrabold"
          lineHeight="16px"
          letterSpacing="widest"
          fontSize="overline"
          fontFamily="heading"
        >
          {t("recent-searches-title")}
        </Text>
      </Box>
      {hasRecentSearches ? (
        <Box>
          <ul style={{ listStyle: "none" }}>
            {data.map((data) => (
              <li key={data.id}>
                <Box
                  h={72}
                  w="full"
                  display="flex"
                  flexDirection="column"
                  justifyContent="center"
                  px={4}
                  _hover={{ bg: "#2351DC" }}
                  transition="all 150ms"
                  cursor="pointer"
                >
                  <Text
                    _groupHover={{ color: "white" }}
                    color="content.secondary"
                    fontSize="body.lg"
                    fontFamily="body"
                    fontWeight="normal"
                    lineHeight="24"
                    letterSpacing="wide"
                  >
                    {data.name}
                  </Text>
                  <Text
                    _groupHover={{ color: "#E8EAFB" }}
                    color="content.tertiary"
                    fontSize="body.lg"
                    fontFamily="body.md"
                    fontWeight="normal"
                    lineHeight="20"
                    letterSpacing="wide"
                  >
                    {data.path}
                  </Text>
                </Box>
              </li>
            ))}
          </ul>
        </Box>
      ) : (
        <Box mt={4} px={4}>
          <Text
            _groupHover={{ color: "white" }}
            color="content.tertiary"
            fontSize="body.lg"
            fontFamily="body"
            fontWeight="normal"
            lineHeight="24"
            letterSpacing="wide"
          >
            {t("recent-searches-no-results")}
          </Text>
        </Box>
      )}
    </Box>
  );
};

export default RecentSearches;
