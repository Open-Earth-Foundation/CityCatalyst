import React from "react";
import { Box } from "@chakra-ui/react";

interface LevelBadgeProps {
  level: string;
}

export const LevelBadge: React.FC<LevelBadgeProps> = ({ level }) => {
  const getBarConfig = (level: string) => {
    switch (level) {
      case "high":
        return {
          color: "sentiment.negativeDefault",
          filledBars: 3,
        };
      case "medium":
        return {
          color: "sentiment.warningDefault",
          filledBars: 2,
        };
      case "low":
        return {
          color: "content.link",
          filledBars: 1,
        };
      default:
        return {
          color: "content.tertiary",
          filledBars: 0,
        };
    }
  };

  const { color, filledBars } = getBarConfig(level);
  const totalBars = 3;

  return (
    <Box display="flex" gap="2px" alignItems="center">
      {Array.from({ length: totalBars }, (_, index) => (
        <Box
          key={index}
          bg={index < filledBars ? color : "border.overlay"}
          w="98px"
          h="5px"
          borderRadius="2.5px"
        />
      ))}
    </Box>
  );
};