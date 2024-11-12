import { Box, Flex } from "@chakra-ui/react";

interface WizardStep {
  title: string;
}

export default function ProgressSteps({
  steps,
  currentStep,
  onSelect = () => {},
}: {
  steps: WizardStep[];
  currentStep: number;
  onSelect?: (selectedStep: number) => void;
}) {
  return (
    <Box>
      <Flex>
        {steps.map((step, index) => (
          <Box
            key={index}
            height="8px"
            w="full"
            mx="2px" // Adjusts the gap between segments
            bg={
              index < currentStep
                ? "content.link" // Completed steps
                : index === currentStep
                  ? "content.link" // Active step
                  : "background.neutral" // Upcoming steps
            }
            borderRadius="md"
            cursor="pointer"
            onClick={() => onSelect(index)}
          ></Box>
        ))}
      </Flex>
    </Box>
  );
}
