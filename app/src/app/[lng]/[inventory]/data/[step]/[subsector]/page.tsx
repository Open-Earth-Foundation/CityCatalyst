"use client";

import MethodologyCard from "@/components/Cards/methodology-card";
import SuggestedActivityCard from "@/components/Cards/suggested-activities-card";
import AddActivityModalEnergyConsumption from "@/components/Modals/add-activity-energy-consumption-modal";
import AddActivityModal from "@/components/Modals/add-activity-modal";
import HeadingText from "@/components/heading-text";
import { useTranslation } from "@/i18n/client";
import { api } from "@/services/api";
import { AddIcon, ArrowBackIcon, ChevronRightIcon } from "@chakra-ui/icons";
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  Button,
  IconButton,
  Link,
  Radio,
  RadioGroup,
  Stack,
  Switch,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Table,
  TableContainer,
  Tabs,
  Tag,
  TagLabel,
  Tbody,
  Td,
  Text,
  Textarea,
  Th,
  Thead,
  Tr,
  useDisclosure,
} from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trans } from "react-i18next";
import { MdMoreVert, MdOutlineHomeWork } from "react-icons/md";

function SubSectorPage({
  params: { lng, step, inventory },
}: {
  params: { lng: string; step: string; inventory: string };
}) {
  const router = useRouter();
  const { t } = useTranslation(lng, "data");
  const [isSelected, setIsSelected] = useState(false);
  const [selectedValue, setSelectedValue] = useState("");

  const [isChecked, setIsChecked] = useState<boolean>(false);

  const [hasActivityData, setHasActivityData] = useState<boolean>(false);

  const handleSwitch = (e: any) => {
    setIsChecked(!isChecked);
  };
  const METHODOLOGIES = [
    {
      name: t("fuel-combustion-consumption"),
      description: t("fuel-combustion-consuption-desciption"),
      inputRequired: [t("total-fuel-consumed")],
      disabled: false,
    },
    {
      name: t("scaled-sample-data"),
      description: t("scaled-sample-data-desc"),
      inputRequired: [t("sample-fuel"), t("scaling-data")],
      disabled: false,
    },
    {
      name: t("modeled-data"),
      description: t("modeled-data-desc"),
      inputRequired: [t("modeled-fuel"), t("build-area")],
      disabled: true,
    },
    {
      name: t("direct-measure"),
      description: t("direct-measure-desc"),
      inputRequired: [t("emissions-data")],
      disabled: false,
    },
  ];
  const BUILDINGS = [
    {
      id: 1,
      name: t("commercial-buildings"),
    },
    {
      id: 2,
      name: t("institutional-buildings"),
    },
    {
      id: 3,
      name: t("street-lighting"),
    },
  ];

  const handleCardClick = () => {
    setIsSelected(!isSelected);
    console.log(isSelected);
  };

  const {
    isOpen: isAddActivityModalOpen,
    onOpen: onAddActivityModalOpen,
    onClose: onAddActivityModalClose,
  } = useDisclosure();

  const {
    isOpen: isAddActivityModalOpenEC,
    onOpen: onAddActivityModalOpenEC,
    onClose: onAddActivityModalCloseEC,
  } = useDisclosure();

  const { data } = api.useMockDataQuery({});
  console.log(data);

  return (
    <div className="pt-16 pb-16 w-[1090px] max-w-full mx-auto px-4">
      <Box w="full" display="flex" alignItems="center" gap="16px" mb="64px">
        <Button
          variant="ghost"
          leftIcon={<ArrowBackIcon boxSize={6} />}
          onClick={() => router.back()}
        >
          {t("go-back")}
        </Button>
        <Box borderRightWidth="1px" borderColor="border.neutral" h="24px" />
        <Box>
          <Breadcrumb
            spacing="8px"
            fontFamily="heading"
            fontWeight="bold"
            letterSpacing="widest"
            textTransform="uppercase"
            separator={<ChevronRightIcon color="gray.500" h="24px" />}
          >
            <BreadcrumbItem>
              <BreadcrumbLink
                href={`/${inventory}/data`}
                color="content.tertiary"
              >
                {t("all-sectors")}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbItem>
              <BreadcrumbLink
                href={`/${inventory}/data/1`}
                color="content.tertiary"
              >
                {t("stationary-energy")}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbItem>
              <BreadcrumbLink href="#" color="content.link">
                {t("commercial-and-institutional-buildings")}
              </BreadcrumbLink>
            </BreadcrumbItem>
          </Breadcrumb>
        </Box>
      </Box>
      <Box display="flex" gap="16px">
        <Box color="content.link" flex="1" pt="3">
          <MdOutlineHomeWork size="32px" />
        </Box>
        <Box display="flex" gap="16px" flexDirection="column">
          <Text fontFamily="heading" fontSize="headline.md" fontWeight="bold">
            i.1.2 {t("commercial-and-institutional-buildings")}
          </Text>
          <Text
            fontFamily="heading"
            letterSpacing="wide"
            fontSize="label.lg"
            fontWeight="medium"
          >
            {t("sector")}: {t("stationary-energy")} | {t("inventory-year")}:
            2023
          </Text>
          <Text
            letterSpacing="wide"
            fontSize="body.lg"
            fontWeight="normal"
            color="interactive.control"
          >
            {t("commercial-and-institutional-building-description")}
          </Text>
        </Box>
      </Box>
      <Box mt="48px">
        <Tabs>
          <TabList>
            <Tab>
              <Text
                fontFamily="heading"
                fontSize="title.md"
                fontWeight="medium"
              >
                {t("scope")} 1
              </Text>
            </Tab>
            <Tab>
              {" "}
              <Text
                fontFamily="heading"
                fontSize="title.md"
                fontWeight="medium"
              >
                {t("scope")} 2
              </Text>
            </Tab>
          </TabList>

          <TabPanels>
            <TabPanel p="0" pt="48px">
              <Box
                h="auto"
                px="24px"
                py="32px"
                bg="base.light"
                borderRadius="8px"
              >
                {" "}
                <Box
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                  mb="84px"
                >
                  <HeadingText title={t("add-data-manually")} />
                  <Box display="flex" gap="16px" fontSize="label.lg">
                    <Switch
                      isChecked={isChecked}
                      onChange={(e) => handleSwitch(e)}
                    />
                    <Text fontFamily="heading" fontWeight="medium">
                      {t("scope-not-applicable")}
                    </Text>
                  </Box>
                </Box>
                {isSelected ? (
                  <Box>
                    <Text
                      fontFamily="heading"
                      fontSize="10px"
                      fontWeight="semibold"
                      letterSpacing="widest"
                      textTransform="uppercase"
                      color="content.tertiary"
                    >
                      {t("methodology")}
                    </Text>
                    <Box display="flex" justifyContent="space-between">
                      <Box>
                        <HeadingText title={t("fuel-combustion-consumption")} />
                        <Text
                          letterSpacing="wide"
                          fontSize="body.lg"
                          fontWeight="normal"
                          color="interactive.control"
                        >
                          {t("fuel-combustion-consumption-description")}
                        </Text>
                      </Box>
                      <Box display="flex" alignItems="center">
                        <Button
                          onClick={onAddActivityModalOpen}
                          title="Add Activity"
                          leftIcon={<AddIcon h="16px" w="16px" />}
                          h="48px"
                          aria-label="activity-button"
                          fontSize="button.md"
                          gap="8px"
                        >
                          {t("add-activity")}
                        </Button>
                        <IconButton
                          icon={<MdMoreVert size="24px" />}
                          aria-label="more-icon"
                          variant="ghost"
                          color="content.tertiary"
                        />
                      </Box>
                    </Box>
                    <Box
                      mt="48px"
                      display="flex"
                      flexDirection="column"
                      gap="16px"
                    >
                      <Text
                        fontFamily="heading"
                        fontSize="title.md"
                        fontWeight="semibold"
                        color="content.secondary"
                      >
                        {t("activity-suggestion")}
                      </Text>
                      {hasActivityData ? (
                        <Box>
                          <Accordion defaultIndex={[0]} allowMultiple>
                            <AccordionItem>
                              <h2>
                                <AccordionButton>
                                  <Box
                                    display="flex"
                                    justifyContent="space-between"
                                    w="full"
                                    alignItems="center"
                                  >
                                    <Box
                                      display="flex"
                                      flexDir="column"
                                      alignItems="start"
                                      gap="8px"
                                    >
                                      <Text
                                        fontFamily="heading"
                                        fontSize="title.md"
                                        fontWeight="semibold"
                                      >
                                        {t("commercial-buildings")}
                                      </Text>
                                      <Text
                                        color="content.tertiary"
                                        letterSpacing="wide"
                                        fontSize="body.md"
                                      >
                                        4 {t("activities-added")}
                                      </Text>
                                    </Box>
                                    <Box
                                      alignItems="start"
                                      display="flex"
                                      fontFamily="heading"
                                    >
                                      <Text fontWeight="medium">
                                        {t("total-consumption")}:&nbsp;
                                      </Text>
                                      <Text fontWeight="normal">
                                        715,4M gallons
                                      </Text>
                                    </Box>
                                    <Box
                                      alignItems="start"
                                      display="flex"
                                      fontFamily="heading"
                                    >
                                      <Text fontWeight="medium">
                                        {t("emissions")}:&nbsp;
                                      </Text>
                                      <Text fontWeight="normal">15,MtCO2e</Text>
                                    </Box>
                                    <Box pr="56px">
                                      <AddIcon color="interactive.control" />
                                    </Box>
                                  </Box>
                                  <AccordionIcon />
                                </AccordionButton>
                              </h2>
                              <AccordionPanel pb={4}>
                                <TableContainer>
                                  <Table
                                    variant="simple"
                                    borderWidth="1px"
                                    borderRadius="20px"
                                  >
                                    <Thead>
                                      <Tr>
                                        <Th>{t("fuel-type")}</Th>
                                        <Th>{t("data-quality")}</Th>
                                        <Th>{t("fuel-consumption")}</Th>
                                        <Th>{t("emissions")}</Th>
                                        <Th></Th>
                                      </Tr>
                                    </Thead>
                                    <Tbody>
                                      {data?.map((activity: any, i: number) => {
                                        return (
                                          <Tr key={i}>
                                            <Td>{activity?.fuelType}</Td>
                                            <Td>
                                              <Tag
                                                size="lg"
                                                variant="outline"
                                                colorScheme="blue"
                                                borderRadius="full"
                                              >
                                                <TagLabel>
                                                  {activity?.dataQuality}
                                                </TagLabel>
                                              </Tag>
                                            </Td>
                                            <Td>
                                              {activity?.fuelConsumption!}
                                            </Td>
                                            <Td>{activity?.emissions}</Td>
                                            <Td>
                                              <IconButton
                                                color="interactive.control"
                                                variant="ghost"
                                                aria-label="activity-data-popover"
                                                icon={
                                                  <MdMoreVert size="24px" />
                                                }
                                              />
                                            </Td>
                                          </Tr>
                                        );
                                      })}
                                    </Tbody>
                                  </Table>
                                </TableContainer>
                              </AccordionPanel>
                            </AccordionItem>
                          </Accordion>

                          <Box
                            w="full"
                            borderTopWidth="3px"
                            borderColor="interactive.secondary"
                            py="32px"
                            px="48px"
                          >
                            <Box display="flex" justifyContent="space-between">
                              <Text
                                fontFamily="heading"
                                fontWeight="semibold"
                                fontSize="headline.md"
                              >
                                {t("total-emissions")}
                              </Text>
                              <Text
                                fontFamily="heading"
                                fontWeight="semibold"
                                fontSize="headline.md"
                              >
                                15,4M tCO2e
                              </Text>
                            </Box>
                          </Box>
                        </Box>
                      ) : (
                        <Box className="flex flex-col gap-4">
                          {BUILDINGS.map(({ id, name }) => (
                            <SuggestedActivityCard key={id} name={name} t={t} />
                          ))}
                        </Box>
                      )}
                    </Box>
                  </Box>
                ) : (
                  <Box>
                    {isChecked ? (
                      <Box>
                        <HeadingText title={t("scope-unavailable")} />
                        <Text
                          letterSpacing="wide"
                          fontSize="body.lg"
                          fontWeight="normal"
                          color="interactive.control"
                          mt="8px"
                        >
                          {t("scope-unavailable-description")}
                        </Text>
                        <Box mt="48px">
                          <Text
                            fontWeight="bold"
                            fontSize="title.md"
                            fontFamily="heading"
                            pt="48px"
                            pb="24px"
                          >
                            {t("select-reason")}
                          </Text>
                          <RadioGroup>
                            <Stack direction="column">
                              <Radio
                                value={t("select-reason-1")}
                                color="interactive.secondary"
                              >
                                {t("select-reason-1")}
                              </Radio>
                              <Radio value={t("select-reason-2")}>
                                {t("select-reason-2")}
                              </Radio>
                              <Radio value={t("select-reason-3")}>
                                {t("select-reason-3")}
                              </Radio>
                              <Radio value={t("select-reason-4")}>
                                {t("select-reason-4")}
                              </Radio>
                            </Stack>
                          </RadioGroup>
                          <Text
                            fontWeight="medium"
                            fontSize="title.md"
                            fontFamily="heading"
                            pt="48px"
                            pb="24px"
                            letterSpacing="wide"
                          >
                            {t("explanation-justification")}
                          </Text>
                          <Textarea
                            borderRadius="4px"
                            borderWidth="1px"
                            borderColor="border.neutral"
                            backgroundColor="base.light"
                            placeholder={t("textarea-placeholder-text")}
                          />
                          <Button h="48px" p="16px" mt="24px">
                            {t("save-changes")}
                          </Button>
                        </Box>
                      </Box>
                    ) : (
                      <Box>
                        <Text
                          letterSpacing="wide"
                          fontSize="body.lg"
                          fontWeight="normal"
                          color="interactive.control"
                        >
                          <Trans t={t} i18nKey="add-data-manually-desciption">
                            To add your inventory data manually, select the
                            methodology used to collect the data and calculate
                            your emissions.{" "}
                            <Link
                              href="/"
                              color="content.link"
                              fontWeight="bold"
                              textDecoration="underline"
                            >
                              Learn more
                            </Link>{" "}
                            about methodologies
                          </Trans>
                        </Text>
                        <Text
                          fontWeight="bold"
                          fontSize="title.md"
                          fontFamily="heading"
                          pt="48px"
                          pb="24px"
                        >
                          {t("select-methodology")}
                        </Text>
                        <Box
                          gap="16px"
                          display="flex"
                          justifyContent="space-between"
                        >
                          {METHODOLOGIES.map(
                            ({
                              name,
                              description,
                              inputRequired,
                              disabled,
                            }) => (
                              <MethodologyCard
                                key={name}
                                name={name}
                                description={description}
                                inputRequired={inputRequired}
                                isSelected={selectedValue === name}
                                disabled={disabled}
                                t={t}
                                handleCardSelect={handleCardClick}
                              />
                            ),
                          )}
                        </Box>
                      </Box>
                    )}
                  </Box>
                )}
              </Box>
            </TabPanel>
            <TabPanel p="0" pt="48px">
              <Box
                h="auto"
                px="24px"
                py="32px"
                bg="base.light"
                borderRadius="8px"
              >
                {" "}
                <Box
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                  mb="84px"
                >
                  <HeadingText title={t("add-data-manually")} />
                  <Box display="flex" gap="16px" fontSize="label.lg">
                    <Switch
                      isChecked={isChecked}
                      onChange={(e) => handleSwitch(e)}
                    />
                    <Text fontFamily="heading" fontWeight="medium">
                      {t("scope-not-applicable")}
                    </Text>
                  </Box>
                </Box>
                {isSelected ? (
                  <Box>
                    <Text
                      fontFamily="heading"
                      fontSize="10px"
                      fontWeight="semibold"
                      letterSpacing="widest"
                      textTransform="uppercase"
                      color="content.tertiary"
                    >
                      {t("methodology")}
                    </Text>
                    <Box display="flex" justifyContent="space-between">
                      <Box>
                        <HeadingText title={t("energy-consumption")} />
                        <Text
                          letterSpacing="wide"
                          fontSize="body.lg"
                          fontWeight="normal"
                          color="interactive.control"
                        >
                          {t("energy-consumption-description")}
                        </Text>
                      </Box>
                      <Box display="flex" alignItems="center">
                        <Button
                          onClick={onAddActivityModalOpenEC}
                          leftIcon={<AddIcon h="16px" w="16px" />}
                          h="48px"
                          aria-label="activity-button"
                          fontSize="button.md"
                          gap="8px"
                        >
                          {t("add-activity")}
                        </Button>
                        <IconButton
                          icon={<MdMoreVert size="24px" />}
                          aria-label="more-icon"
                          variant="ghost"
                          color="content.tertiary"
                        />
                      </Box>
                    </Box>
                    <Box
                      mt="48px"
                      display="flex"
                      flexDirection="column"
                      gap="16px"
                    >
                      <Text
                        fontFamily="heading"
                        fontSize="title.md"
                        fontWeight="semibold"
                        color="content.secondary"
                      >
                        {t("activity-suggestion")}
                      </Text>
                      {hasActivityData ? (
                        <Box>
                          <Accordion defaultIndex={[0]} allowMultiple>
                            <AccordionItem>
                              <h2>
                                <AccordionButton>
                                  <Box
                                    display="flex"
                                    justifyContent="space-between"
                                    w="full"
                                    alignItems="center"
                                  >
                                    <Box
                                      display="flex"
                                      flexDir="column"
                                      alignItems="start"
                                      gap="8px"
                                    >
                                      <Text
                                        fontFamily="heading"
                                        fontSize="title.md"
                                        fontWeight="semibold"
                                      >
                                        {t("commercial-buildings")}
                                      </Text>
                                      <Text
                                        color="content.tertiary"
                                        letterSpacing="wide"
                                        fontSize="body.md"
                                      >
                                        4 {t("activities-added")}
                                      </Text>
                                    </Box>
                                    <Box
                                      alignItems="start"
                                      display="flex"
                                      fontFamily="heading"
                                    >
                                      <Text fontWeight="medium">
                                        {t("total-consumption")}:&nbsp;
                                      </Text>
                                      <Text fontWeight="normal">
                                        715,4M gallons
                                      </Text>
                                    </Box>
                                    <Box
                                      alignItems="start"
                                      display="flex"
                                      fontFamily="heading"
                                    >
                                      <Text fontWeight="medium">
                                        {t("emissions")} :&nbsp;
                                      </Text>
                                      <Text fontWeight="normal">15,MtCO2e</Text>
                                    </Box>
                                    <Box pr="56px">
                                      <AddIcon color="interactive.control" />
                                    </Box>
                                  </Box>
                                  <AccordionIcon />
                                </AccordionButton>
                              </h2>
                              <AccordionPanel pb={4}>
                                <TableContainer>
                                  <Table
                                    variant="simple"
                                    borderWidth="1px"
                                    borderRadius="20px"
                                  >
                                    <Thead>
                                      <Tr>
                                        <Th>{t("fuel-type")} </Th>
                                        <Th>{t("data-quality")} </Th>
                                        <Th>{t("fuel-consumption")} </Th>
                                        <Th>{t("emissions")}</Th>
                                        <Th></Th>
                                      </Tr>
                                    </Thead>
                                    <Tbody>
                                      <Tr>
                                        <Td>Natural Gas</Td>
                                        <Td>
                                          <Tag
                                            size="lg"
                                            variant="outline"
                                            colorScheme="blue"
                                            borderRadius="full"
                                          >
                                            <TagLabel>Medium</TagLabel>
                                          </Tag>
                                        </Td>
                                        <Td>25.4 gallons</Td>
                                        <Td>25.4 tCO2e</Td>
                                        <Td>
                                          <IconButton
                                            color="interactive.control"
                                            variant="ghost"
                                            aria-label="activity-data-popover"
                                            icon={<MdMoreVert size="24px" />}
                                          />
                                        </Td>
                                      </Tr>
                                    </Tbody>
                                  </Table>
                                </TableContainer>
                              </AccordionPanel>
                            </AccordionItem>
                          </Accordion>

                          <Box
                            w="full"
                            borderTopWidth="3px"
                            borderColor="interactive.secondary"
                            py="32px"
                            px="48px"
                          >
                            <Box display="flex" justifyContent="space-between">
                              <Text
                                fontFamily="heading"
                                fontWeight="semibold"
                                fontSize="headline.md"
                              >
                                {t("total-emissions")}
                              </Text>
                              <Text
                                fontFamily="heading"
                                fontWeight="semibold"
                                fontSize="headline.md"
                              >
                                15,4M tCO2e
                              </Text>
                            </Box>
                          </Box>
                        </Box>
                      ) : (
                        <Box className="flex flex-col gap-4">
                          {BUILDINGS.map(({ id, name }) => (
                            <SuggestedActivityCard key={id} name={name} t={t} />
                          ))}
                        </Box>
                      )}
                    </Box>
                  </Box>
                ) : (
                  <Box>
                    {isChecked ? (
                      <Box>
                        <HeadingText title={t("scope-unavailable")} />
                        <Text
                          letterSpacing="wide"
                          fontSize="body.lg"
                          fontWeight="normal"
                          color="interactive.control"
                          mt="8px"
                        >
                          {t("scope-unavailable-description")}
                        </Text>
                        <Box mt="48px">
                          <Text
                            fontWeight="bold"
                            fontSize="title.md"
                            fontFamily="heading"
                            pt="48px"
                            pb="24px"
                          >
                            {t("select-reason")}
                          </Text>
                          <RadioGroup>
                            <Stack direction="column">
                              <Radio
                                value={t("select-reason-1")}
                                color="interactive.secondary"
                              >
                                {t("select-reason-1")}
                              </Radio>
                              <Radio value={t("select-reason-2")}>
                                {t("select-reason-2")}
                              </Radio>
                              <Radio value={t("select-reason-3")}>
                                {t("select-reason-3")}
                              </Radio>
                              <Radio value={t("select-reason-4")}>
                                {t("select-reason-4")}
                              </Radio>
                            </Stack>
                          </RadioGroup>
                          <Text
                            fontWeight="medium"
                            fontSize="title.md"
                            fontFamily="heading"
                            pt="48px"
                            pb="24px"
                            letterSpacing="wide"
                          >
                            {t("explanation-justification")}
                          </Text>
                          <Textarea
                            borderRadius="4px"
                            borderWidth="1px"
                            borderColor="border.neutral"
                            backgroundColor="base.light"
                            placeholder={t("textarea-placeholder-text")}
                          />
                          <Button h="48px" p="16px" mt="24px">
                            {t("save-changes")}
                          </Button>
                        </Box>
                      </Box>
                    ) : (
                      <Box>
                        <Text
                          letterSpacing="wide"
                          fontSize="body.lg"
                          fontWeight="normal"
                          color="interactive.control"
                        >
                          <Trans t={t} i18nKey="add-data-manually-desciption">
                            To add your inventory data manually, select the
                            methodology used to collect the data and calculate
                            your emissions.{" "}
                            <Link
                              href="/"
                              color="content.link"
                              fontWeight="bold"
                              textDecoration="underline"
                            >
                              Learn more
                            </Link>{" "}
                            about methodologies
                          </Trans>
                        </Text>
                        <Text
                          fontWeight="bold"
                          fontSize="title.md"
                          fontFamily="heading"
                          pt="48px"
                          pb="24px"
                        >
                          {t("select-methodology")}
                        </Text>
                        <Box
                          gap="16px"
                          display="flex"
                          justifyContent="space-between"
                        >
                          {METHODOLOGIES.map(
                            ({
                              name,
                              description,
                              inputRequired,
                              disabled,
                            }) => (
                              <MethodologyCard
                                key={name}
                                name={name}
                                description={description}
                                inputRequired={inputRequired}
                                isSelected={selectedValue === name}
                                disabled={disabled}
                                t={t}
                                handleCardSelect={handleCardClick}
                              />
                            ),
                          )}
                        </Box>
                      </Box>
                    )}
                  </Box>
                )}
              </Box>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </Box>
      <AddActivityModal
        t={t}
        userInfo={null}
        isOpen={isAddActivityModalOpen}
        onClose={onAddActivityModalClose}
        hasActivityData={hasActivityData}
        setHasActivityData={setHasActivityData}
      />
      <AddActivityModalEnergyConsumption
        t={t}
        userInfo={null}
        isOpen={isAddActivityModalOpenEC}
        onClose={onAddActivityModalCloseEC}
        hasActivityData={hasActivityData}
        setHasActivityData={setHasActivityData}
      />
    </div>
  );
}

export default SubSectorPage;
