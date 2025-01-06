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
      <Box className="px-4">
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
          <ul className="list-none">
            {data.map((data) => (
              <li key={data.id}>
                <Box className="h-[72px] w-full flex flex-col justify-center group px-4 hover:bg-[#2351DC] transition-all duration-150 cursor-pointer">
                  <Text
                    className="group-hover:text-white"
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
                    className="group-hover:text-[#E8EAFB]"
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
        <Box className="mt-4 px-4">
          <Text
            className="group-hover:text-white"
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
