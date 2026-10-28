import React from "react";
import { Box } from "@chakra-ui/react";
import { Tooltip } from "@/components/ui/tooltip";

interface ToolbarActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  dataTestId?: string;
}

const ToolbarActionButton: React.FC<ToolbarActionButtonProps> = ({
  icon,
  label,
  onClick,
  dataTestId,
}) => {
  return (
    <Tooltip content={label}>
      <Box
        as="button"
        onClick={onClick}
        aria-label={label}
        data-testid={dataTestId}
        display="flex"
        alignItems="center"
        justifyContent="center"
        h="48px"
        w="48px"
        borderRadius="full"
        border="2px solid"
        borderColor="interactive.secondary"
        color="interactive.secondary"
        cursor="pointer"
        _hover={{ bg: "background.neutral" }}
      >
        {icon}
      </Box>
    </Tooltip>
  );
};

export default ToolbarActionButton;
