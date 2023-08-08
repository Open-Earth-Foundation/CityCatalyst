import { Box, Step, StepIcon, StepIndicator, StepNumber, StepSeparator, StepStatus, StepTitle, Stepper, useSteps } from "@chakra-ui/react"

interface WizardStep {
  title: string;
}

export default function WizardSteps({
  steps,
  currentStep,
  onSelect = () => {},
}: {
  steps: WizardStep[],
  currentStep: number,
  onSelect?: (selectedStep: number) => void,
}) {
  return (
    <Stepper index={currentStep} my={8} colorScheme="brandScheme" size="lg">
      {steps.map((step, index) => (
        <Step key={index} onClick={() => onSelect(index)}>
          <StepIndicator>
            <StepStatus
              complete={<StepIcon />}
              incomplete={<StepNumber />}
              active={<StepNumber />}
            />
          </StepIndicator>

          <Box flexShrink='0'>
            <StepTitle>{step.title}</StepTitle>
          </Box>

          <StepSeparator />
        </Step>
      ))}
    </Stepper>
  )
}

