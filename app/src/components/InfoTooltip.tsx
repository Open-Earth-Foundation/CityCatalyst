import { Box, Icon } from "@chakra-ui/react";
import { MdInfoOutline } from "react-icons/md";
import { Tooltip, TooltipProps } from "@/components/ui/tooltip";

interface InfoTooltipProps
  extends Pick<TooltipProps, "content" | "contentProps" | "positioning"> {
  iconColor?: string;
  iconSize?: number;
}

export function InfoTooltip({
  content,
  contentProps,
  positioning,
  iconColor = "content.tertiary",
  iconSize = 4,
}: InfoTooltipProps) {
  return (
    <Tooltip
      content={content}
      contentProps={contentProps}
      positioning={positioning}
    >
      <Box
        display="inline-flex"
        alignItems="center"
        justifyContent="center"
        minW="32px"
        minH="32px"
        cursor="pointer"
      >
        <Icon as={MdInfoOutline} boxSize={iconSize} color={iconColor} />
      </Box>
    </Tooltip>
  );
}
