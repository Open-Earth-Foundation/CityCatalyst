import {
  Box,
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
    { fallback: "md" }
  );
  return (
    <Stepper
      index={currentStep}
      my={8}
      colorScheme="brandScheme"
      size="lg"
      orientation={orientation}
    >
      {steps.map((step, index) => (
        <Step key={index} onClick={() => onSelect(index)}>
          <StepIndicator>
            <StepStatus
              complete={<StepIcon />}
              incomplete={<StepNumber />}
              active={<StepNumber />}
            />
          </StepIndicator>

          <Box flexShrink="0">
            <StepTitle>{step.title}</StepTitle>
          </Box>

          <StepSeparator />
        </Step>
      ))}
    </Stepper>
  );
}
