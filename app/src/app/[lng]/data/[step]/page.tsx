"use client";

import { CircleIcon, DataAlertIcon } from "@/components/icons";
import WizardSteps from "@/components/wizard-steps";
import { useTranslation } from "@/i18n/client";
import { ArrowBackIcon } from "@chakra-ui/icons";
import { Link } from "@chakra-ui/react";
import {
  Box,
  Button,
  Card,
  Flex,
  Heading,
  Icon,
  IconButton,
  Progress,
  SimpleGrid,
  Stack,
  Tag,
  TagLabel,
  TagLeftIcon,
  Text,
  useDisclosure,
  useSteps,
} from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FiTarget, FiTrash2, FiTruck } from "react-icons/fi";
import {
  MdAdd,
  MdArrowDropDown,
  MdArrowDropUp,
  MdCheckCircle,
  MdOutlineCheckCircle,
  MdOutlineEdit,
  MdOutlineFactory,
  MdOutlineHomeWork,
  MdOutlineHouse,
  MdOutlineSkipNext,
  MdPlaylistAddCheck,
} from "react-icons/md";
import { SourceDrawer } from "./SourceDrawer";
import { SubsectorDrawer } from "./SubsectorDrawer";
import subSectorData from "./subsectors.json";
import { SegmentedProgress } from "@/components/SegmentedProgress";

const dataSourceDescription =
  "Leveraging satellite imagery, this dataset provides key information about residential structures, aiding in the assessment of their energy usage and corresponding carbon footprints";
const dataSourceMethodoloygy =
  "Power sector emissions are estimated by first assembling a global geolocated inventory of power plants, generation, and metered emissions data. Machine learning models then predict power plant generation from satellite images. These predictions are aggregated and combined with available generation data and carbon intensity factors to derive emissions estimates.";
const rawDataSources: DataSource[] = [
  {
    id: 0,
    icon: MdOutlineHouse,
    title: "Residential buildings - Google Environmental Insights",
    dataQuality: "high",
    scopes: [1, 2],
    description: dataSourceDescription,
    url: "https://openclimate.network",
    isConnected: false,
    updateFrequency: "year",
    sources: ["Satellite imagery", "Ground truth", "Alternative"],
    methodology: dataSourceMethodoloygy,
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
    updateFrequency: "month",
    sources: ["Satellite imagery", "Ground truth", "Alternative"],
    methodology: dataSourceMethodoloygy,
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
    updateFrequency: "day",
    sources: ["Satellite imagery", "Ground truth", "Alternative"],
    methodology: dataSourceMethodoloygy,
  },
];

const dataSources = rawDataSources
  .reduce((acc, source) => {
    acc.push(source, source, source);
    return acc;
  }, [] as DataSource[])
  .map((source, id) => {
    source.id = id;
    return source;
  });

export default function OnboardingSteps({
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
  const { activeStep, goToNext, setActiveStep } = useSteps({
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
      `/${activeStep + 1}`,
    );
    history.replaceState("", "", newPath);
  }, [activeStep]);
  const currentStep = steps[activeStep];
  const totalStepCompletion =
    currentStep.connectedProgress + currentStep.addedProgress;
  const formatPercentage = (percentage: number) =>
    Math.round(percentage * 1000) / 10;

  const [selectedSource, setSelectedSource] = useState<DataSource>();
  const {
    isOpen: isSourceDrawerOpen,
    onClose: onSourceDrawerClose,
    onOpen: onSourceDrawerOpen,
  } = useDisclosure();
  const onSourceClick = (source: DataSource) => {
    setSelectedSource(source);
    onSourceDrawerOpen();
  };

  const onConnectClick = (source: DataSource) => {
    console.log("Connect source", source);
    onSourceDrawerClose();
  };

  const [selectedSubsector, setSelectedSubsector] = useState<SubSector>();
  const {
    isOpen: isSubsectorDrawerOpen,
    onClose: onSubsectorDrawerClose,
    onOpen: onSubsectorDrawerOpen,
  } = useDisclosure();
  const subSectors: SubSector[] = subSectorData[activeStep];
  const onSubsectorClick = (subsector: SubSector) => {
    console.log(subsector);
    setSelectedSubsector(subsector);
    onSubsectorDrawerOpen();
  };
  const onSubsectorSave = (subsector: SubSector) => {
    console.log("Save subsector", subsector);
  };

  const [isConfirming, setConfirming] = useState(false);
  const onConfirm = async () => {
    setConfirming(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setConfirming(false);
    if (activeStep >= steps.length - 1) {
      router.push("/"); // go back to dashboard until there is a confirmation page
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
      goToNext();
    }
  };

  const onSkip = () => {
    if (activeStep >= steps.length - 1) {
      router.push("/"); // go back to dashboard until there is a confirmation page
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
      goToNext();
    }
  };

  const [isDataSectionExpanded, setDataSectionExpanded] = useState(false);

  return (
    <div className="pt-16 w-[1090px] max-w-full mx-auto px-4">
      <Button
        variant="ghost"
        leftIcon={<ArrowBackIcon boxSize={6} />}
        onClick={() => router.back()}
        fontFamily="var(--font-poppins)"
        letterSpacing="1.25px"
      >
        {t("go-back")}
      </Button>
      <div className="w-full flex md:justify-center mb-8">
        <div className="lg:w-[800px]">
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
            <Text color="content.tertiary">{currentStep.details}</Text>
            <Flex direction="row">
              <SegmentedProgress
                values={[
                  currentStep.connectedProgress,
                  currentStep.addedProgress,
                ]}
                height={4}
              />
              <Heading size="sm" ml={6} className="whitespace-nowrap -mt-1">
                {t("completion-percent", {
                  progress: formatPercentage(totalStepCompletion),
                })}
              </Heading>
            </Flex>
            <Tag mr={4}>
              <TagLeftIcon
                as={CircleIcon}
                boxSize={6}
                color="interactive.quaternary"
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
                color="interactive.tertiary"
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
        <Text color="content.tertiary" mb={12}>
          {t("check-data-details")}
        </Text>
        <SimpleGrid minChildWidth="250px" spacing={4}>
          {dataSources
            .slice(0, isDataSectionExpanded ? dataSources.length : 6)
            .map((source) => (
              <Card
                key={source.id}
                onClick={() => onSourceClick(source)}
                variant="outline"
                borderColor={
                  (source.isConnected && "interactive.tertiary") || undefined
                }
                className="hover:drop-shadow-xl transition-shadow"
              >
                <Icon as={source.icon} boxSize={9} mb={6} />
                <Heading size="sm" noOfLines={2}>
                  {source.title}
                </Heading>
                <Flex direction="row" my={4}>
                  <Tag mr={1}>
                    <TagLeftIcon
                      as={MdPlaylistAddCheck}
                      boxSize={4}
                      color="content.tertiary"
                    />
                    <TagLabel fontSize={12}>
                      {t("data-quality")}: {t("quality-" + source.dataQuality)}
                    </TagLabel>
                  </Tag>
                  <Tag>
                    <TagLeftIcon
                      as={FiTarget}
                      boxSize={4}
                      color="content.tertiary"
                    />
                    <TagLabel fontSize={12}>
                      {t("scope")}: {source.scopes.join(", ")}
                    </TagLabel>
                  </Tag>
                </Flex>
                <Text color="content.tertiary" noOfLines={5}>
                  {source.description}
                </Text>
                <Link className="underline" mt={4} mb={6}>
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
                  <Button
                    variant="outline"
                    bgColor="background.neutral"
                    onClick={() => onConnectClick(source)}
                  >
                    {t("connect-data")}
                  </Button>
                )}
              </Card>
            ))}
        </SimpleGrid>
        <Button
          variant="ghost"
          color="content.tertiary"
          onClick={() => setDataSectionExpanded(!isDataSectionExpanded)}
          mt={8}
          fontWeight="normal"
          rightIcon={
            <Icon
              boxSize={6}
              as={isDataSectionExpanded ? MdArrowDropUp : MdArrowDropDown}
            />
          }
        >
          {t(isDataSectionExpanded ? "less-datasets" : "more-datasets")}
        </Button>
      </Card>
      {/*** Manual data entry section for subsectors ***/}
      <Card mb={48}>
        <Heading size="lg" mb={2}>
          {t("add-data-heading")}
        </Heading>
        <Text color="content.tertiary" mb={12}>
          {t("add-data-details")}
        </Text>
        <Heading size="sm" mb={4}>
          {t("select-subsector")}
        </Heading>
        <SimpleGrid minChildWidth="250px" spacing={4}>
          {subSectors.map((subSector) => (
            <Card
              maxHeight="120px"
              height="120px"
              w="full"
              className="hover:drop-shadow-xl transition-shadow"
              onClick={() => onSubsectorClick(subSector)}
              key={subSector.id}
            >
              <Flex direction="row" className="space-x-4 items-center h-full">
                <Icon
                  as={subSector.isAdded ? MdOutlineCheckCircle : DataAlertIcon}
                  boxSize={8}
                  color={
                    subSector.isAdded
                      ? "interactive.tertiary"
                      : "sentiment.warningDefault"
                  }
                />
                <Stack w="full">
                  <Heading size="xs" noOfLines={3} maxWidth="200px">
                    {t(subSector.title)}
                  </Heading>
                  <Text color="content.tertiary">
                    {t("scope")}: {subSector.scopes.join(", ")}
                  </Text>
                </Stack>
                <IconButton
                  aria-label={t("edit-subsector")}
                  variant="solidIcon"
                  icon={
                    <Icon
                      as={subSector.isAdded ? MdOutlineEdit : MdAdd}
                      boxSize={6}
                    />
                  }
                />
              </Flex>
            </Card>
          ))}
        </SimpleGrid>
      </Card>
      {/*** Bottom bar ***/}
      <div className="bg-white w-full fixed bottom-0 left-0 border-t-4 border-brand py-8 px-8 drop-shadow-2xl hover:drop-shadow-4xl transition-all">
        <Box className="w-[1090px] max-w-full mx-auto px-4 flex flex-row flex-wrap gap-y-4">
          <Box className="grow w-full md:w-0">
            <Text fontSize="sm">Step {activeStep + 1}</Text>
            <Text fontSize="2xl" as="b">
              {steps[activeStep]?.title}
            </Text>
          </Box>
          <Button
            h={16}
            onClick={onSkip}
            variant="ghost"
            leftIcon={<Icon as={MdOutlineSkipNext} boxSize={6} />}
            size="sm"
            px={12}
            mr={6}
          >
            {t("skip-step-button")}
          </Button>
          <Button
            h={16}
            isLoading={isConfirming}
            px={12}
            onClick={onConfirm}
            size="sm"
          >
            {t("save-continue-button")}
          </Button>
        </Box>
      </div>
      {/*** Drawers ***/}
      <SourceDrawer
        source={selectedSource}
        isOpen={isSourceDrawerOpen}
        onClose={onSourceDrawerClose}
        onConnectClick={() => onConnectClick(selectedSource!)}
        t={t}
      />
      <SubsectorDrawer
        subsector={selectedSubsector}
        isOpen={isSubsectorDrawerOpen}
        onClose={onSubsectorDrawerClose}
        onSave={onSubsectorSave}
        t={t}
      />
    </div>
  );
}
