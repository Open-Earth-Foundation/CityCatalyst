import { Box, Step, StepIcon, StepIndicator, StepNumber, StepSeparator, StepStatus, StepTitle, Stepper, useSteps } from "@chakra-ui/react"

interface WizardStep {
  title: string;
}

export default function WizardSteps({
  steps,
  currentStep,
  onSelect,
}: {
  steps: WizardStep[],
  currentStep: number,
  onSelect?: (selectedStep: number) => void,
}) {
  const { activeStep } = useSteps({
    index: currentStep,
    count: steps.length,
  })

  return (
    <Stepper index={currentStep} my={8} colorScheme="brandScheme">
      {steps.map((step, index) => (
        <Step key={index}>
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

