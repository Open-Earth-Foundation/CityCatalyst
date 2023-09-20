import { Box, Text } from "@chakra-ui/react";
import React from "react";

const RecentSearches = () => {
  const hasRecentSearches = true;
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
          RECENT SEARCHES
        </Text>
      </Box>
      {hasRecentSearches ? (
        <Box>
          <ul className="list-none">
            <li>
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
                  Rio de Janeiro
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
                  Brazil {">"} Rio de Janeiro
                </Text>
              </Box>
            </li>
            <li>
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
                  Brisbane
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
                  Australia {">"} Queensland
                </Text>
              </Box>
            </li>
            <li>
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
                  Ciudad Autónoma de Buenos Aires
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
                  Argentina {">"} Capital Federal
                </Text>
              </Box>
            </li>
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
            You have no recent searches
          </Text>
        </Box>
      )}
    </Box>
  );
};

export default RecentSearches;
