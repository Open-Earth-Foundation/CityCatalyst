"use client";

import {
  AddIcon,
  ArrowBackIcon,
  CheckIcon,
  ChevronRightIcon,
} from "@chakra-ui/icons";
import {
  Box,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  Button,
  Card,
  Checkbox,
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
  Tabs,
  Text,
  Textarea,
  useRadio,
} from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { useTranslation } from "@/i18n/client";
import { MdMoreVert, MdOutlineHomeWork } from "react-icons/md";
import HeadingText from "@/components/heading-text";
import MethodologyCard from "@/components/Cards/methodology-card";

const METHODOLOGIES = [
  {
    name: "Fuel combustion consumption",
    description:
      "Direct recording of fuels combusted in commercial buildings. ",
    inputRequired: ["Total fuel consumed amound"],
    disabled: false,
  },
  {
    name: "Scaled sample data",
    description:
      "Extrapolates emissions from a representative sample of buildings.",
    inputRequired: [
      "Sample fuel consumed amount",
      "Scaling data (population, GDP, area, etc.) for sample and city level",
    ],
    disabled: false,
  },
  {
    name: "Modeled data",
    description: "Emissions estimated from predictive models. ",
    inputRequired: ["Modeled fuel intensity consumption", "Built area"],
    disabled: true,
  },
  {
    name: "Direct measure",
    description:
      "Direct emission measurements from commercial buildings' combustion sources.",
    inputRequired: ["Emissions data"],
    disabled: false,
  },
];

const BUILDINGS = [
  {
    id: 1,
    name: "Commercial Buildings",
  },
  {
    id: 2,
    name: "Institutional Buildings",
  },
  {
    id: 3,
    name: "Street Lighting",
  },
];

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

  const [hasActivityData, setHasActivityData] = useState<boolean>(true);

  const handleSwitch = (e: any) => {
    setIsChecked(!isChecked);
  };

  const handleCardClick = () => {
    setIsSelected(!isSelected);
    console.log(isSelected);
  };

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
                ALL SECTORS
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbItem>
              <BreadcrumbLink
                href={`/${inventory}/data/1`}
                color="content.tertiary"
              >
                Stationary Energy
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbItem>
              <BreadcrumbLink href="#" color="content.link">
                Commercial And Institutional Buildings
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
            i.1.2 Commercial and Institutional Buildings
          </Text>
          <Text
            fontFamily="heading"
            letterSpacing="wide"
            fontSize="label.lg"
            fontWeight="medium"
          >
            Sector: Stationary Energy | Inventory Year: 2023
          </Text>
          <Text
            letterSpacing="wide"
            fontSize="body.lg"
            fontWeight="normal"
            color="interactive.control"
          >
            Includes all emissions from energy use in commercial buildings and
            in institutional public buildings such as schools, hospitals,
            government offices, highway street lighting, and other public
            facilities.
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
                Scope 1
              </Text>
            </Tab>
            <Tab>
              {" "}
              <Text
                fontFamily="heading"
                fontSize="title.md"
                fontWeight="medium"
              >
                Scope 2
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
                  <HeadingText title="Add Data Manually to Your Inventory" />
                  <Box display="flex" gap="16px" fontSize="label.lg">
                    <Switch
                      isChecked={isChecked}
                      onChange={(e) => handleSwitch(e)}
                    />
                    <Text fontFamily="heading" fontWeight="medium">
                      This scope is not applicable to my city
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
                      methodology
                    </Text>
                    <Box display="flex" justifyContent="space-between">
                      <Box>
                        <HeadingText title="Fuel Combustion Consumption" />
                        <Text
                          letterSpacing="wide"
                          fontSize="body.lg"
                          fontWeight="normal"
                          color="interactive.control"
                        >
                          Direct recording of fuels combusted in commercial
                          buildings.
                        </Text>
                      </Box>
                      <Box display="flex" alignItems="center">
                        <Button
                          title="Add Activity"
                          leftIcon={<AddIcon h="16px" w="16px" />}
                          h="48px"
                          aria-label="activity-button"
                          fontSize="button.md"
                          gap="8px"
                        >
                          add activity
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
                        Suggested activities to complete.
                      </Text>
                      {BUILDINGS.map(({ id, name }) => (
                        <Card
                          display="flex"
                          flexDirection="row"
                          w="full"
                          h="100px"
                          p="16px"
                          gap="16px"
                          shadow="none"
                          borderWidth="1px"
                          borderColor="border.overlay"
                          cursor="pointer"
                          _hover={{ shadow: "md" }}
                        >
                          <Box display="flex" alignItems="center">
                            <Checkbox
                              borderRadius="full"
                              __css={{
                                "& .chakra-checkbox__control": {
                                  bg: "white",
                                  color: "#2351DC", // TODO: figure out how to include theme variable in css
                                  borderRadius: "full",
                                  borderColor: "#D7D8FA",
                                  h: "24px",
                                  w: "24px",
                                  fontSize: "24px",
                                },
                              }}
                              _checked={{
                                "& .chakra-checkbox__control": {
                                  bg: "white",
                                  color: "content.link",
                                  borderRadius: "full",
                                  borderColor: "content.link",
                                  h: "24px",
                                  w: "24px",
                                  fontSize: "24px",
                                },
                              }}
                            />
                          </Box>
                          <Box
                            display="flex"
                            flexDirection="column"
                            justifyContent="center"
                            h="full"
                            w="full"
                          >
                            <Text
                              letterSpacing="wide"
                              fontSize="body.md"
                              fontWeight="normal"
                              color="interactive.control"
                            >
                              Type of buildings
                            </Text>
                            <Text
                              letterSpacing="wide"
                              fontSize="16px"
                              fontWeight="medium"
                              fontFamily="heading"
                            >
                              {name}
                            </Text>
                          </Box>
                          <Box
                            display="flex"
                            alignItems="center"
                            w="full"
                            justifyContent="end"
                          >
                            <Button
                              title="Add Activity"
                              leftIcon={<AddIcon h="16px" w="16px" />}
                              h="48px"
                              variant="ghost"
                              aria-label="activity-button"
                              fontSize="button.md"
                              color="content.link"
                              gap="8px"
                            >
                              add activity
                            </Button>
                          </Box>
                        </Card>
                      ))}
                    </Box>
                  </Box>
                ) : (
                  <Box>
                    {isChecked ? (
                      <Box>
                        <HeadingText title="Scope Unavailable/Not Applicable to My City" />
                        <Text
                          letterSpacing="wide"
                          fontSize="body.lg"
                          fontWeight="normal"
                          color="interactive.control"
                          mt="8px"
                        >
                          Some emissions activities may not be relevant for your
                          city, or maybe they're accounted for in a different
                          section. Check the reason that fits and provide
                          details if needed. This helps keep your inventory
                          accurate and tailored to your city.
                        </Text>
                        <Box mt="48px">
                          <Text
                            fontWeight="bold"
                            fontSize="title.md"
                            fontFamily="heading"
                            pt="48px"
                            pb="24px"
                          >
                            Select Reason
                          </Text>
                          <RadioGroup>
                            <Stack direction="column">
                              <Radio value="1" color="interactive.secondary">
                                The activity or process does not occur or exist
                                within the city
                              </Radio>
                              <Radio value="2">
                                The emissions for this activity are not
                                estimated
                              </Radio>
                              <Radio value="3">
                                The emissions could lead to the disclosure of
                                confidential information
                              </Radio>
                              <Radio value="4">
                                The emissions for this activity are estimated
                                and presented elsewhere
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
                            Explanation/ Justification
                          </Text>
                          <Textarea
                            borderRadius="4px"
                            borderWidth="1px"
                            borderColor="border.neutral"
                            backgroundColor="base.light"
                            placeholder="Write in detail why this scope is not included"
                          />
                          <Button h="48px" p="16px" mt="24px">
                            SAVE CHANGES
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
                        </Text>
                        <Text
                          fontWeight="bold"
                          fontSize="title.md"
                          fontFamily="heading"
                          pt="48px"
                          pb="24px"
                        >
                          Select Methodology
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
            <TabPanel>
              <p>Manual Data Scope 2</p>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </Box>
    </div>
  );
}

export default SubSectorPage;
