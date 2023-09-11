"use client";

import SubSectorCard from "@/components/Cards/SubSectorCard";
import Footer from "@/components/Sections/Footer";
import { NavigationBar } from "@/components/navigation-bar";
import { CheckCircleIcon, InfoOutlineIcon } from "@chakra-ui/icons";
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Avatar,
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  Heading,
  Link,
  Text,
} from "@chakra-ui/react";
import Image from "next/image";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { BsTruck } from "react-icons/bs";
import { FiDownload } from "react-icons/fi";
import {
  MdArrowForward,
  MdArrowOutward,
  MdCheckCircleOutline,
  MdGroup,
  MdOutlineAddchart,
  MdOutlineAspectRatio,
} from "react-icons/md";
import { PiTrashLight } from "react-icons/pi";
import { TbBuildingCommunity } from "react-icons/tb";
import { useToast } from "@chakra-ui/react";
import { useState } from "react";

enum STATUS {
  INFO = "info",
  SUCCESS = "success",
  ERROR = "error",
}

const CITY_INTENTORY_YEAR = "DE_BER";

export default function Home({ params: { lng } }: { params: { lng: string } }) {
  const router = useRouter();
  const toast = useToast();

  // Accordion

  const [isStationaryEnSectorOpen, setIsStationarySectorEnOpen] =
    useState(false);
  const [isTransportSecOpen, setIsTransportSecOpen] = useState(false);
  const [isWasteSectorOpen, setWasteSectorOpen] = useState(false);

  // Function to toggle the accordion section
  const toggleAccordionA = () => {
    setIsStationarySectorEnOpen(!isStationaryEnSectorOpen);
  };
  const toggleAccordionB = () => {
    setIsTransportSecOpen(!isTransportSecOpen);
  };

  const toggleAccordionC = () => {
    setWasteSectorOpen(!isWasteSectorOpen);
  };

  const showToast = (
    title: string,
    description: string,
    status: any,
    duration: number,
    bgColor: string,
  ) => {
    toast({
      description: description,
      status: status,
      duration: duration,
      isClosable: true,
      render: () => (
        <Box
          display="flex"
          gap="8px"
          color="white"
          alignItems="center"
          justifyContent="space-between"
          p={3}
          bg={bgColor}
          width="600px"
          height="60px"
          borderRadius="8px"
        >
          <Box display="flex" gap="8px" alignItems="center">
            {status === "info" || status === "error" ? (
              <InfoOutlineIcon fontSize="24px" />
            ) : (
              <MdCheckCircleOutline fontSize="24px" />
            )}
            <Text
              color="base.light"
              fontWeight="bold"
              lineHeight="52"
              fontSize="label.lg"
              fontFamily="heading"
            >
              {title}
            </Text>
          </Box>
          {status === "error" ? (
            <Button
              onClick={handleDownload}
              fontWeight="600"
              fontSize="16px"
              letterSpacing="1.25px"
              variant="unstyled"
              bgColor="none"
            >
              Try again
            </Button>
          ) : (
            ""
          )}
        </Box>
      ),
    });
  };
  const handleDownload = () => {
    showToast(
      "Preparing your dataset for download",
      "Please wait while we fetch your data",
      STATUS.INFO,
      2000,
      "semantic.info",
    );
    fetch(`/api/v0/city/:city/inventory/${CITY_INTENTORY_YEAR}.xls`)
      .then((res) => {
        if (!res.ok) {
          throw new Error("Network response was not ok");
        }

        const contentDisposition = res.headers.get("Content-Disposition");
        if (contentDisposition) {
          const match = contentDisposition.match(/filename="(.+)"/);
          const filename = match ? match[1] : `${CITY_INTENTORY_YEAR}.xls`;
          return res.blob().then((blob) => {
            const downloadLink = document.createElement("a");
            downloadLink.href = URL.createObjectURL(blob);
            downloadLink.download = filename;

            downloadLink.click();
            showToast(
              "Inventory report download completed!",
              "Downloading your data",
              STATUS.SUCCESS,
              2000,
              "interactive.primary",
            );
            URL.revokeObjectURL(downloadLink.href);
          });
        }
      })

      .catch((error) => {
        showToast(
          "Download failed",
          "There was an error during download",
          STATUS.ERROR,
          2000,
          "semantic.danger",
        );
      });
  };

  return (
    <>
      <NavigationBar lng={lng} />
      <Box bg="brand.primary" className="w-full h-[491px] pt-[150px]">
        <Box className="flex mx-auto w-[1090px]">
          <Box className="w-full h-[240px] flex flex-col justify-center">
            <Box className="flex h-[240px]">
              <Box className="flex gap-[24px] flex-col h-full w-full">
                <Text
                  fontSize="headline.sm"
                  color="brandScheme.100"
                  lineHeight="32"
                  fontWeight="semibold"
                >
                  Welcome Back,
                </Text>
                <Box className="flex items-center gap-4 w-[644px] h-[104px]">
                  <Avatar
                    className="h-[32px] w-[32px]"
                    name="Argentina"
                    src="https://upload.wikimedia.org/wikipedia/commons/1/1a/Flag_of_Argentina.svg"
                  />
                  <Heading
                    fontSize="display.md"
                    color="base.light"
                    fontWeight="semibold"
                    lineHeight="52"
                    className="flex"
                  >
                    Ciudad Autónoma de Buenos Aires
                  </Heading>
                </Box>
                <Box className="flex gap-8 mt-[24px]">
                  <Box className="flex align-baseline gap-3">
                    <Box>
                      <MdArrowOutward
                        className="relative top-0"
                        size={24}
                        fill="#5FE500"
                      />
                    </Box>
                    <Box>
                      <Box className="flex gap-1">
                        <Text
                          fontFamily="heading"
                          color="base.light"
                          fontSize="headline.sm"
                          fontWeight="semibold"
                          lineHeight="32"
                        >
                          700<span className="text-[16px]">Mtco2e</span>
                        </Text>
                        <InfoOutlineIcon w={3} h={3} color="brandScheme.100" />
                      </Box>
                      <Text
                        fontSize="body.md"
                        color="brandScheme.100"
                        fontStyle="normal"
                        fontWeight={400}
                        lineHeight="20px"
                        letterSpacing="wide"
                      >
                        Total emissions in 2023
                      </Text>
                    </Box>
                  </Box>
                  <Box className="flex align-baseline gap-3">
                    <Box>
                      <MdGroup
                        className="relative top-0"
                        size={24}
                        fill="#C5CBF5"
                      />
                    </Box>
                    <Box>
                      <Box className="flex gap-1">
                        <Text
                          fontFamily="heading"
                          color="base.light"
                          fontSize="headline.sm"
                          fontWeight="semibold"
                          lineHeight="32"
                        >
                          3,978.9<span className="text-[16px]">M</span>
                        </Text>
                        <InfoOutlineIcon w={3} h={3} color="brandScheme.100" />
                      </Box>
                      <Text
                        fontSize="body.md"
                        color="brandScheme.100"
                        fontStyle="normal"
                        fontWeight={400}
                        lineHeight="20px"
                        letterSpacing="wide"
                      >
                        Total Population
                      </Text>
                    </Box>
                  </Box>
                  <Box className="flex align-baseline gap-3">
                    <Box>
                      <MdOutlineAspectRatio
                        className="relative top-0"
                        size={24}
                        fill="#C5CBF5"
                      />
                    </Box>
                    <Box>
                      <Box className="flex gap-1">
                        <Text
                          fontFamily="heading"
                          color="base.light"
                          fontSize="headline.sm"
                          fontWeight="semibold"
                          lineHeight="32"
                        >
                          782<span className="text-[16px]">km2</span>
                        </Text>
                        <InfoOutlineIcon w={3} h={3} color="brandScheme.100" />
                      </Box>
                      <Text
                        fontSize="body.md"
                        color="brandScheme.100"
                        fontStyle="normal"
                        fontWeight={400}
                        lineHeight="20px"
                        letterSpacing="wide"
                      >
                        Total land area
                      </Text>
                    </Box>
                  </Box>
                </Box>
              </Box>
              <Box>
                <Image
                  src="/assets/map_placeholder.png"
                  alt=""
                  width={622}
                  height={517}
                />
              </Box>
            </Box>
            <Box className="flex gap-[24px] relative justify-between top-[100px]">
              <NextLink href="/data">
                <Card
                  shadow="2dp"
                  backgroundColor="base.light"
                  borderColor="interactive.accent"
                  borderWidth="thin"
                  className="h-[132px] w-[533px] px-[24px] py-0 hover:shadow-xl"
                >
                  <Box className="flex items-center w-fill">
                    <Box>
                      <Box className="flex items-center justify-center h-[48px] w-[48px] rounded-full bg-[#008600]">
                        <MdOutlineAddchart className="text-white" size={24} />
                      </Box>
                    </Box>
                    <Box>
                      <CardHeader className="flex h-[20px] gap-2">
                        <Text
                          fontFamily="heading"
                          fontSize="title.lg"
                          color="interactive.primary"
                          fontWeight="semibold"
                        >
                          Add Data to Inventory
                        </Text>
                      </CardHeader>
                      <CardBody className="h-[75px]">
                        <Text
                          fontSize="body.lg"
                          color="body"
                          lineHeight="24"
                          letterSpacing="wide"
                        >
                          Upload data or connect third-party data to complete
                          the GPC Basic Emissions Inventory
                        </Text>
                      </CardBody>
                    </Box>
                  </Box>
                </Card>
              </NextLink>
              <Box>
                <Card
                  onClick={handleDownload}
                  shadow="2dp"
                  backgroundColor="base.light"
                  className="h-[132px] w-[533px] px-[24px] py-0 hover:shadow-xl"
                >
                  <Box className="flex items-center w-fill">
                    <Box>
                      <Box className="flex items-center justify-center h-[48px] w-[48px] rounded-full bg-[#2351DC]">
                        <FiDownload className="text-white" size={24} />
                      </Box>
                    </Box>
                    <Box>
                      <CardHeader className="flex h-[20px] gap-2">
                        <Text
                          fontFamily="heading"
                          fontSize="title.lg"
                          color="interactive.secondary"
                          fontWeight="semibold"
                        >
                          Download
                        </Text>
                      </CardHeader>
                      <CardBody className="h-[75px]">
                        <Text
                          fontSize="body.lg"
                          color="body"
                          lineHeight="24"
                          letterSpacing="wide"
                        >
                          View and download your inventory data in CSV or GPC
                          format and share your progress
                        </Text>
                      </CardBody>
                    </Box>
                  </Box>
                </Card>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
      <section className="h-full bg-[#fafafa] pt-[128px] pb-[100px]">
        <Box className="flex mx-auto w-[1090px]">
          <Box className="flex flex-col gap-[8px] w-full h-300">
            <Box className="flex items-center gap-3">
              <Heading
                fontSize="headline.sm"
                fontWeight="semibold"
                lineHeight="32"
              >
                GPC Basic Emission Inventory Calculation - Year 2023
              </Heading>
              <InfoOutlineIcon color="interactive.control" />
            </Box>
            <Text
              fontWeight="regular"
              fontSize="body.lg"
              color="interactive.control"
              letterSpacing="wide"
            >
              The data you have submitted is now officially incorporated into
              your city&apos;s 2023 GHG Emissions Inventory, compiled according
              to the GPC Basic methodology.{" "}
              <Link
                href={"/"}
                fontWeight="bold"
                color="brand.primary"
                className="text-[#2351DC] font-[700] underline"
              >
                Learn more
              </Link>{" "}
              about GPC Protocol
            </Text>
            <Box className="flex w-full justify-between items-center mt-2 gap-[24px]">
              <Box
                backgroundColor="interactive.tertiary"
                borderRadius="full"
                className="w-[946px] flex h-[16px]"
              >
                <Box
                  backgroundColor="interactive.connected"
                  borderRadius="full"
                  className="h-full w-[308px]"
                />
              </Box>
              <Box>
                <Heading fontWeight="semibold" fontSize="body.md">
                  100% completed
                </Heading>
              </Box>
            </Box>
            <Box className="flex gap-[16px] mt-[16px]">
              <Box className="w-[279px] flex gap-2 px-3 items-center justify-center rounded-full h-[30px] border border-[#E8EAFB]">
                <Box
                  borderRadius="full"
                  backgroundColor="interactive.connected"
                  className="h-[12px] w-[12px]"
                />
                <Text
                  fontSize="label.md"
                  lineHeight="20"
                  fontWeight="regular"
                  letterSpacing="wide"
                >
                  33% Connected third-party data
                </Text>
              </Box>
              <Box className="w-[192px] flex gap-2 px-3 items-center justify-center rounded-full h-[30px] border border-[#E8EAFB]">
                <Box
                  borderRadius="full"
                  backgroundColor="interactive.tertiary"
                  className="h-[12px] w-[12px]"
                />
                <Text
                  fontSize="label.md"
                  lineHeight="20"
                  fontWeight="regular"
                  letterSpacing="wide"
                >
                  66% Uploaded data
                </Text>
              </Box>
            </Box>
            <Box className=" flex flex-col gap-[24px] py-[48px]">
              <Text
                fontFamily="heading"
                fontSize="title.md"
                fontWeight="semibold"
                lineHeight="24"
              >
                Sectors required from inventory
              </Text>
              <Box
                backgroundColor="base.light"
                borderRadius="rounded"
                className="w-full flex flex-col min-h-[268px] px-6 py-8"
              >
                <Box className="flex gap-5">
                  <Box className="flex items-start mt-2">
                    <TbBuildingCommunity color="#2351DC" size={32} />
                  </Box>
                  <Box>
                    <Box className="flex items-center justify-between">
                      <Box className="flex flex-col">
                        <Box className="flex gap-2 py-1 w-[715px]">
                          <Heading
                            fontSize="title.lg"
                            fontWeight="semibold"
                            lineHeight="24"
                            className="pb-[8px]"
                          >
                            Stationary Energy
                          </Heading>
                        </Box>
                        <Text
                          color="interactive.control"
                          fontSize="body.lg"
                          lineHeight="24"
                          letterSpacing="wide"
                        >
                          This sector deals with emissions that result from the
                          generation of electricity, heat, and steam, as well as
                          their consumption.
                        </Text>
                        <Heading
                          fontWeight="semibold"
                          fontSize="body.md"
                          lineHeight="20"
                          letterSpacing="wide"
                          className="py-[16px]"
                        >
                          Scope Required for GPC Basic Inventory: 1, 2
                        </Heading>
                      </Box>
                      <Box>
                        <Button
                          onClick={() => router.push("/data/1")}
                          variant="outline"
                          className="border-2 w-[256px] h-[48px] py-[16px] gap-2"
                        >
                          <Text
                            fontFamily="heading"
                            color="brand.secondary"
                            fontSize="button.md"
                          >
                            ADD DATA TO SECTOR
                          </Text>
                          <MdArrowForward color="#2351DC" size={24} />
                        </Button>
                      </Box>
                    </Box>
                    <Box className="flex w-full justify-between items-center just">
                      <Box className="w-[848px] flex rounded-full h-[8px] bg-[#24BE00]">
                        <Box className="h-full w-[239px] rounded-l-full bg-[#FA7200]" />
                      </Box>
                      <Text
                        fontFamily="heading"
                        fontWeight="semibold"
                        fontSize="body.md"
                      >
                        100% Completed
                      </Text>
                    </Box>
                  </Box>
                </Box>
                <Box className="w-full pt-[24px] items-center justify-center">
                  <Accordion border="none" allowToggle w="full">
                    <AccordionItem border="none">
                      <AccordionPanel padding={0}>
                        <Text className="font-[600]">Sub-sectors required</Text>
                        <Box className="grid grid-cols-3 gap-4 py-4">
                          <SubSectorCard
                            title="Residential Buildings"
                            scopes="1, 2"
                          />
                          <SubSectorCard
                            title="Commercial and institutional buildings and facilities"
                            scopes="1, 2"
                          />
                          <SubSectorCard
                            title="Manufacturing industries and construction"
                            scopes="1, 2"
                          />
                          <SubSectorCard
                            title="Energy industries"
                            scopes="1, 2"
                          />
                          <SubSectorCard
                            title="Fugitive emissions from oil and natural gas systems"
                            scopes="1, 2"
                          />
                        </Box>
                      </AccordionPanel>
                      <AccordionButton
                        onClick={toggleAccordionA}
                        className="flex justify-center"
                        background="none"
                        color="content.tertiary"
                        gap={2}
                      >
                        <Text
                          fontFamily="heading"
                          fontWeight="semibold"
                          fontSize="button.md"
                          letterSpacing="wider"
                          fontStyle="normal"
                          className="hover:underline hover:text-[#001EA7]"
                        >
                          {isStationaryEnSectorOpen ? "VIEW LESS" : "VIEW MORE"}
                        </Text>
                        <AccordionIcon h={7} w={7} />
                      </AccordionButton>
                    </AccordionItem>
                  </Accordion>
                </Box>
              </Box>
              <Box
                backgroundColor="base.light"
                borderRadius="rounded"
                className="w-full flex flex-col min-h-[268px] px-6 py-8"
              >
                <Box className="flex gap-5">
                  <Box className="flex items-start mt-2">
                    <BsTruck color="#2351DC" size={32} />
                  </Box>
                  <Box>
                    <Box className="flex items-center justify-between">
                      <Box className="flex flex-col">
                        <Box className="flex gap-2 py-1 w-[715px]">
                          <Heading
                            fontSize="title.lg"
                            fontWeight="semibold"
                            lineHeight="24"
                            className="pb-[8px]"
                          >
                            Transportation
                          </Heading>
                        </Box>
                        <Text
                          color="interactive.control"
                          fontSize="body.lg"
                          lineHeight="24"
                          letterSpacing="wide"
                        >
                          This sector deals with emissions from the
                          transportation of goods and people within the city
                          boundary.
                        </Text>
                        <Text
                          fontFamily="heading"
                          fontWeight="semibold"
                          fontSize="body.md"
                          lineHeight="20"
                          letterSpacing="wide"
                          className="py-[16px]"
                        >
                          Scope Required for GPC Basic Inventory: 1, 2
                        </Text>
                      </Box>
                      <Box>
                        <Button
                          onClick={() => router.push("/data/2")}
                          variant="outline"
                          className="border-2 w-[256px] h-[48px] py-[16px] gap-2"
                        >
                          <Text
                            fontFamily="heading"
                            color="brand.secondary"
                            fontSize="button.md"
                          >
                            ADD DATA TO SECTOR
                          </Text>
                          <MdArrowForward color="#2351DC" size={24} />
                        </Button>
                      </Box>
                    </Box>
                    <Box className="flex w-full justify-between items-center just">
                      <Box className="w-[848px] flex rounded-full h-[8px] bg-[#24BE00]">
                        <Box className="h-full w-[239px] rounded-l-full bg-[#FA7200]" />
                      </Box>
                      <Text
                        fontFamily="heading"
                        fontWeight="semibold"
                        fontSize="body.md"
                      >
                        100% Completed
                      </Text>
                    </Box>
                  </Box>
                </Box>
                <Box className="w-full pt-[24px] items-center justify-center">
                  <Accordion border="none" allowToggle w="full">
                    <AccordionItem border="none">
                      <AccordionPanel padding={0}>
                        <Text className="font-[600]">Sub-sectors required</Text>
                        <Box className="grid grid-cols-3 gap-4 py-4">
                          <SubSectorCard title="On-Road" scopes="1, 2" />
                          <SubSectorCard title="Aviation" scopes="1, 2" />
                          <SubSectorCard title="Railways" scopes="1, 2" />
                          <SubSectorCard title="Off Road" scopes="1, 2" />
                          <SubSectorCard
                            title="Waterbone navigation"
                            scopes="1, 2"
                          />
                        </Box>
                      </AccordionPanel>
                      <AccordionButton
                        onClick={toggleAccordionB}
                        className="flex justify-center"
                        background="none"
                        color="content.tertiary"
                        gap={2}
                      >
                        <Text
                          fontFamily="heading"
                          fontWeight="semibold"
                          fontSize="button.md"
                          letterSpacing="wider"
                          fontStyle="normal"
                          className="hover:underline hover:text-[#001EA7]"
                        >
                          {isTransportSecOpen ? "VIEW LESS" : "VIEW MORE"}
                        </Text>
                        <AccordionIcon h={7} w={7} />
                      </AccordionButton>
                    </AccordionItem>
                  </Accordion>
                </Box>
              </Box>
              <Box
                backgroundColor="base.light"
                borderRadius="rounded"
                className="w-full flex flex-col min-h-[268px] px-6 py-8"
              >
                <Box className="flex gap-5">
                  <Box className="flex items-start mt-2">
                    <PiTrashLight color="#2351DC" size={32} />
                  </Box>
                  <Box>
                    <Box className="flex items-center justify-between">
                      <Box className="flex flex-col">
                        <Box className="flex gap-2 py-1 w-[715px]">
                          <Heading
                            fontSize="title.lg"
                            fontWeight="semibold"
                            lineHeight="24"
                            className="pb-[8px]"
                          >
                            Waste and wastewater
                          </Heading>
                        </Box>
                        <Text
                          color="interactive.control"
                          fontSize="body.lg"
                          lineHeight="24"
                          letterSpacing="wide"
                        >
                          This sector covers emissions generated from waste
                          management processes.
                        </Text>
                        <Text
                          fontFamily="heading"
                          fontWeight="semibold"
                          fontSize="body.md"
                          lineHeight="20"
                          letterSpacing="wide"
                          className="py-[16px]"
                        >
                          Scope Required for GPC Basic Inventory: 1, 2
                        </Text>
                      </Box>
                      <Box>
                        <Button
                          onClick={() => router.push("/data/3")}
                          variant="outline"
                          className="border-2 w-[256px] h-[48px] py-[16px] gap-2"
                        >
                          <Text
                            fontFamily="heading"
                            color="brand.secondary"
                            fontSize="button.md"
                          >
                            ADD DATA TO SECTOR
                          </Text>
                          <MdArrowForward color="#2351DC" size={24} />
                        </Button>
                      </Box>
                    </Box>
                    <Box className="flex w-full justify-between items-center gap-5">
                      <Box className="w-[848px] flex rounded-full h-[8px] bg-[#24BE00]">
                        <Box className="h-full w-[239px] rounded-l-full bg-[#FA7200]" />
                      </Box>
                      <Text
                        fontFamily="heading"
                        fontWeight="semibold"
                        fontSize="body.md"
                      >
                        100% Completed
                      </Text>
                    </Box>
                  </Box>
                </Box>
                <Box className="w-full pt-[24px] items-center justify-center">
                  <Accordion border="none" allowToggle w="full">
                    <AccordionItem border="none">
                      <AccordionPanel padding={0}>
                        <Text className="font-[600]">Sub-sectors required</Text>
                        <Box className="grid grid-cols-3 gap-4 py-4">
                          <SubSectorCard
                            title="Disposal of solid waste generated in the city"
                            scopes="1, 2"
                          />
                          <SubSectorCard
                            title="Biological treatment of waste generated in the city"
                            scopes="1, 2"
                          />
                          <SubSectorCard
                            title="Incineration and open burning of waste generated in the city"
                            scopes="1, 2"
                          />
                          <SubSectorCard
                            title="Wastewater generated in the city"
                            scopes="1, 2"
                          />
                        </Box>
                      </AccordionPanel>
                      <AccordionButton
                        onClick={toggleAccordionC}
                        className="flex justify-center"
                        background="none"
                        color="content.tertiary"
                        gap={2}
                      >
                        <Text
                          fontFamily="heading"
                          fontWeight="semibold"
                          fontSize="button.md"
                          letterSpacing="wider"
                          fontStyle="normal"
                          className="hover:underline hover:text-[#001EA7]"
                        >
                          {isWasteSectorOpen ? "VIEW LESS" : "VIEW MORE"}
                        </Text>
                        <AccordionIcon h={7} w={7} />
                      </AccordionButton>
                    </AccordionItem>
                  </Accordion>
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>
      </section>
      <Footer />
    </>
  );
}
