"use client";

import { CircleIcon, DataAlertIcon } from "@/components/icons";
import WizardSteps from "@/components/wizard-steps";
import { useTranslation } from "@/i18n/client";
import { ArrowBackIcon } from "@chakra-ui/icons";
import { Link } from "@chakra-ui/next-js";
import {
  Button,
  Card,
  Flex,
  Heading,
  Icon,
  IconButton,
  Progress,
  Stack,
  Tag,
  TagLabel,
  TagLeftIcon,
  Text,
  Wrap,
  WrapItem,
  useSteps,
} from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { FiTarget, FiTrash2, FiTruck } from "react-icons/fi";
import {
  MdCheckCircle,
  MdOutlineCheckCircle,
  MdOutlineEdit,
  MdOutlineFactory,
  MdOutlineHomeWork,
  MdOutlineHouse,
  MdPlaylistAddCheck,
} from "react-icons/md";

const dataSourceDescription =
  "Leveraging satellite imagery, this dataset provides key information about residential structures, aiding in the assessment of their energy usage and corresponding carbon footprints";
const dataSources = [
  {
    id: 0,
    icon: MdOutlineHouse,
    title: "Residential buildings - Google Environmental Insights",
    dataQuality: "high",
    scopes: [1, 2],
    description: dataSourceDescription,
    url: "https://openclimate.network",
    isConnected: false,
  },
  {
    id: 1,
    icon: MdOutlineHomeWork,
    title:
      "Commercial and institutional buildings and facilities - Google Environmental Insights",
    dataQuality: "low",
    scopes: [1, 3],
    description: dataSourceDescription,
    url: "https://openclimate.network",
    isConnected: false,
  },
  {
    id: 2,
    icon: MdOutlineFactory,
    title: "Energy industries - Google Environmental Insights",
    dataQuality: "medium",
    scopes: [3],
    description: dataSourceDescription,
    url: "https://openclimate.network",
    isConnected: true,
  },
];

type SubSector = {
  id: number | string;
  title: string;
  scopes: number[];
  isAdded: boolean;
};

export default function Onboarding({
  params: { lng, step },
}: {
  params: { lng: string; step: string };
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
    index: Number(step) - 1,
    count: steps.length,
  });
  const onStepSelected = (selectedStep: number) => {
    setActiveStep(selectedStep);
  };
  useEffect(() => {
    // change step param in URL without reloading
    const newPath = location.pathname.replace(
      /\/[0-9]+$/,
      `/${activeStep + 1}`
    );
    history.replaceState("", "", newPath);
  }, [activeStep]);
  const currentStep = steps[activeStep];
  const totalStepCompletion =
    currentStep.connectedProgress + currentStep.addedProgress;
  const formatPercentage = (percentage: number) =>
    Math.round(percentage * 1000) / 10;

  const subSectors: SubSector[] = [
    {
      id: 0,
      title: t("residential-buildings"),
      scopes: [1, 2],
      isAdded: true,
    },
    {
      id: 1,
      title: t("commercial-buildings"),
      scopes: [1, 2],
      isAdded: true,
    },
    {
      id: 2,
      title: t("manufacturing-construction"),
      scopes: [1, 2],
      isAdded: false,
    },
    {
      id: 3,
      title: t("energy-industries"),
      scopes: [1, 2],
      isAdded: true,
    },
    {
      id: 4,
      title: t("emissions-oil-natural-gas"),
      scopes: [1],
      isAdded: true,
    },
    {
      id: 5,
      title: t("emissions-coal"),
      scopes: [1],
      isAdded: true,
    },
    {
      id: 6,
      title: t("agriculture"),
      scopes: [1, 2],
      isAdded: true,
    },
  ];

  const onSubSectorClick = (subSector: SubSector) => {
    console.log(subSector);
  };

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
      {/*** Sector summary section ***/}
      <Card mb={12}>
        <Flex direction="row">
          <Icon as={currentStep.icon} boxSize={8} color="brand" mr={4} />
          <div className="space-y-4 w-full">
            <Heading size="lg" mb={2}>
              {currentStep.title}
            </Heading>
            <Text color="tertiary">{currentStep.details}</Text>
            <Flex direction="row">
              <Progress
                value={totalStepCompletion * 100}
                color="interactiveQuaternary"
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
                color="interactiveQuaternary"
              />
              <TagLabel>
                {t("data-connected-percent", {
                  progress: formatPercentage(currentStep.connectedProgress),
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
                  progress: formatPercentage(currentStep.addedProgress),
                })}
              </TagLabel>
            </Tag>
          </div>
        </Flex>
      </Card>
      {/*** Third party data source section ***/}
      <Card mb={12}>
        <Heading size="lg" mb={2}>
          {t("check-data-heading")}
        </Heading>
        <Text color="tertiary" mb={12}>
          {t("check-data-details")}
        </Text>
        <Flex direction="row" className="space-x-4">
          {dataSources.map((source) => (
            <Card key={source.id}>
              <Icon as={source.icon} boxSize={9} mb={6} />
              <Heading size="sm" noOfLines={2}>
                {source.title}
              </Heading>
              <Flex direction="row" my={4}>
                <Tag mr={1}>
                  <TagLeftIcon
                    as={MdPlaylistAddCheck}
                    boxSize={4}
                    color="contentTertiary"
                  />
                  <TagLabel fontSize={12}>
                    {t("data-quality")}: {t("quality-" + source.dataQuality)}
                  </TagLabel>
                </Tag>
                <Tag>
                  <TagLeftIcon
                    as={FiTarget}
                    boxSize={4}
                    color="contentTertiary"
                  />
                  <TagLabel fontSize={12}>
                    {t("scope")}: {source.scopes.join(", ")}
                  </TagLabel>
                </Tag>
              </Flex>
              <Text color="contentTertiary" noOfLines={5}>
                {source.description}
              </Text>
              <Link
                href={source.url}
                className="underline"
                mt={4}
                mb={6}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("see-more-details")}
              </Link>
              {source.isConnected ? (
                <Button
                  variant="solidPrimary"
                  px={6}
                  py={4}
                  leftIcon={<Icon as={MdCheckCircle} />}
                >
                  {t("data-connected")}
                </Button>
              ) : (
                <Button variant="outline" bgColor="backgroundNeutral">
                  {t("connect-data")}
                </Button>
              )}
            </Card>
          ))}
        </Flex>
      </Card>
      {/*** Manual data entry section for subsectors ***/}
      <Card mb={12}>
        <Heading size="lg" mb={2}>
          {t("add-data-heading")}
        </Heading>
        <Text color="tertiary" mb={12}>
          {t("add-data-details")}
        </Text>
        <Heading size="sm" mb={4}>
          {t("select-subsector")}
        </Heading>
        <Wrap direction="row" spacing={4}>
          {subSectors.map((subSector) => (
            <WrapItem key={subSector.id} width="32%" maxWidth="32%">
              <Card
                maxHeight="120px"
                height="120px"
                w="full"
                className="hover:drop-shadow-xl transition-shadow"
                onClick={() => onSubSectorClick(subSector)}
              >
                <Flex direction="row" className="space-x-4 items-center h-full">
                  <Icon
                    as={
                      subSector.isAdded ? MdOutlineCheckCircle : DataAlertIcon
                    }
                    boxSize={8}
                    color={
                      subSector.isAdded
                        ? "interactiveTertiary"
                        : "sentimentWarningDefault"
                    }
                  />
                  <Stack w="full">
                    <Heading size="xs" noOfLines={3} maxWidth="200px">
                      {subSector.title}
                    </Heading>
                    <Text color="contentTertiary">
                      {t("scope")}: {subSector.scopes.join(", ")}
                    </Text>
                  </Stack>
                  <IconButton
                    aria-label={t("edit-subsector")}
                    variant="solid"
                    bgColor="backgroundNeutral"
                    color="interactiveSecondary"
                    icon={<Icon as={MdOutlineEdit} boxSize={6} />}
                  />
                </Flex>
              </Card>
            </WrapItem>
          ))}
        </Wrap>
      </Card>
    </div>
  );
}
