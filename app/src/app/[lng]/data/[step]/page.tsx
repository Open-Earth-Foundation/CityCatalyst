"use client";

import { CircleIcon } from "@/components/icons";
import WizardSteps from "@/components/wizard-steps";
import { useTranslation } from "@/i18n/client";
import { ArrowBackIcon } from "@chakra-ui/icons";
import {
  Button,
  Card,
  Flex,
  Heading,
  Icon,
  Progress,
  Tag,
  TagLabel,
  TagLeftIcon,
  Text,
  useSteps,
} from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { FiTrash2, FiTruck } from "react-icons/fi";
import { MdOutlineHomeWork } from "react-icons/md";

export default function Onboarding({
  params: { lng },
}: {
  params: { lng: string };
}) {
  const { t } = useTranslation(lng, "data");
  const router = useRouter();
  const steps = [
    {
      title: t("stationary-energy"),
      details: t("stationary-energy-details"),
      icon: MdOutlineHomeWork,
      connectedProgress: 0.041,
      addedProgress: 0.6662,
    },
    {
      title: t("transportation"),
      details: t("transportation-details"),
      icon: FiTruck,
      connectedProgress: 0.234,
      addedProgress: 0.432,
    },
    {
      title: t("waste"),
      details: t("waste-details"),
      icon: FiTrash2,
      connectedProgress: 0.11,
      addedProgress: 0.5,
    },
  ];
  const { activeStep, goToNext, goToPrevious, setActiveStep } = useSteps({
    index: 0,
    count: steps.length,
  });
  const onStepSelected = (selectedStep: number) => {
    setActiveStep(selectedStep);
  };
  const step = steps[activeStep];
  const totalStepCompletion = step.connectedProgress + step.addedProgress;
  const formatPercentage = (percentage: number) =>
    Math.round(percentage * 1000) / 10;

  return (
    <div className="pt-16 w-[1090px] max-w-full mx-auto px-4">
      <Button
        variant="ghost"
        leftIcon={<ArrowBackIcon boxSize={6} />}
        onClick={() => router.back()}
      >
        Go Back
      </Button>
      <div className="w-full flex justify-center mb-8">
        <div className="w-[800px]">
          <WizardSteps
            currentStep={activeStep}
            steps={steps}
            onSelect={onStepSelected}
          />
        </div>
      </div>
      <Card px={6} py={8}>
        <Flex direction="row">
          <Icon as={step.icon} boxSize={8} color="brand" mr={4} />
          <div className="space-y-4 w-full">
            <Heading size="lg" mb={2}>
              {step.title}
            </Heading>
            <Text color="tertiary">{step.details}</Text>
            <Flex direction="row">
              <Progress
                value={totalStepCompletion * 100}
                color="interactiveSecondary"
                w="full"
                borderRadius={16}
                mr={6}
              />
              <Heading size="sm" className="whitespace-nowrap -mt-1">
                {t("completion-percent", {
                  progress: formatPercentage(totalStepCompletion),
                })}
              </Heading>
            </Flex>
            <Tag mr={4}>
              <TagLeftIcon
                as={CircleIcon}
                boxSize={6}
                color="interactiveSecondary"
              />
              <TagLabel>
                {t("data-connected-percent", {
                  progress: formatPercentage(step.connectedProgress),
                })}
              </TagLabel>
            </Tag>
            <Tag>
              <TagLeftIcon
                as={CircleIcon}
                boxSize={6}
                color="interactiveTertiary"
              />
              <TagLabel>
                {t("data-added-percent", {
                  progress: formatPercentage(step.addedProgress),
                })}
              </TagLabel>
            </Tag>
          </div>
        </Flex>
      </Card>
    </div>
  );
}
