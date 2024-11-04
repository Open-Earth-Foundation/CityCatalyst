import {
  Box,
  Flex,
  Progress,
  Step,
  StepIcon,
  StepIndicator,
  StepNumber,
  StepSeparator,
  StepStatus,
  StepTitle,
  Stepper,
  useBreakpointValue,
} from "@chakra-ui/react";

interface WizardStep {
  title: string;
}

export default function WizardSteps({
  steps,
  currentStep,
  onSelect = () => {},
}: {
  steps: WizardStep[];
  currentStep: number;
  onSelect?: (selectedStep: number) => void;
}) {
  const orientation: "horizontal" | "vertical" | undefined = useBreakpointValue(
    { base: "vertical", md: "horizontal" },
    { fallback: "md" },
  );
  const gap: "0" | undefined = useBreakpointValue(
    { base: "0", md: undefined },
    { fallback: "md" },
  );

  const progressPercent = ((currentStep + 1) / steps.length) * 100;

  return (
    <Box>
      {/* <Stepper
        index={currentStep}
        my={8}
        colorScheme="brandScheme"
        size="lg"
        orientation={orientation}
        gap={gap}
      >
        {steps.map((step, index) => (
          <Step key={index} onClick={() => onSelect(index)}>
            <StepSeparator  />
          </Step>
        ))}
      </Stepper>
      <Progress
        value={progressPercent}
        position="absolute"
        height="3px"
        width="full"
        top="10px"
        zIndex={-1}
      /> */}
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
                  : "gray.200" // Upcoming steps
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
