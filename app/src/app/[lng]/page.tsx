"use client";

import { NavigationBar } from "@/components/navigation-bar";
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
  CardFooter,
  CardHeader,
  Heading,
  Progress,
  Text,
} from "@chakra-ui/react";
import Link from "next/link";
import pageClassNames from "./PageClassNames";
import {
  MdArrowForward,
  MdArrowOutward,
  MdBarChart,
  MdDownload,
  MdFireTruck,
  MdGroup,
  MdInfoOutline,
  MdOutlineAddchart,
  MdOutlineAnalytics,
  MdOutlineAspectRatio,
} from "react-icons/md";
import { BsTruck } from "react-icons/bs";
import { PiTrashLight } from "react-icons/pi";
import Image from "next/image";
import { FiDownload } from "react-icons/fi";
import { ChevronDownIcon, InfoOutlineIcon } from "@chakra-ui/icons";
import { Open_Sans } from "next/font/google";
import { TbBuildingCommunity } from "react-icons/tb";
import SubSectorCard from "@/components/Cards/SubSectorCard";
import Footer from "@/components/Sections/Footer";

const opensans = Open_Sans({
  subsets: ["latin"],
  weight: ["300", "400"],
});

export default function Home({ params: { lng } }: { params: { lng: string } }) {
  return (
    <>
      <NavigationBar lng={lng} />
      <section className={pageClassNames.hero}>
        <Box className={pageClassNames.container2}>
          <Box className={pageClassNames.heroText}>
            <Box className="flex  h-[240px]">
              <Box className="flex gap-[24px] flex-col h-full w-full">
                <Text className="text-[24px] text-[#C5CBF5] leading-[52px] text-hi font-[600] relative">
                  Welcome Back,
                </Text>
                <Box className="flex items-center gap-4 w-[644px] h-[104px]">
                  <Avatar
                    className="h-[32px] w-[32px]"
                    name="Argentina"
                    src="https://upload.wikimedia.org/wikipedia/commons/1/1a/Flag_of_Argentina.svg"
                  />
                  <Heading className="flex relative font-[600] text-white text-[45px]">
                    Ciudad Autónoma de Buenos Aires
                  </Heading>
                </Box>
                <Box className="flex gap-8 mt-[24px]">
                  <Box className="flex text-white align-baseline gap-3">
                    <Box>
                      <MdArrowOutward
                        className="relative top-0"
                        size={28}
                        fill="#5FE500"
                      />
                    </Box>
                    <Box>
                      <Box className="flex gap-1">
                        <Heading className="text-[24px] font-[600]">
                          700<span className="text-[16px]">Mtco2e</span>
                        </Heading>
                        <InfoOutlineIcon w={3} h={3} color={"#C5CBF5"} />
                      </Box>
                      <Text className="relative -top-1 text-[14px] text-[#C5CBF5]">
                        in 2023
                      </Text>
                    </Box>
                  </Box>
                  <Box className="flex text-white align-baseline gap-3">
                    <Box>
                      <MdGroup
                        className="relative top-0"
                        size={28}
                        fill="#C5CBF5"
                      />
                    </Box>
                    <Box>
                      <Box className="flex gap-1">
                        <Heading className="text-[24px] font-[600]">
                          3,978.9<span className="text-[16px]">M</span>
                        </Heading>
                        <InfoOutlineIcon w={3} h={3} color={"#C5CBF5"} />
                      </Box>
                      <Text className="relative -top-1 text-[14px] text-[#C5CBF5]">
                        Total Population
                      </Text>
                    </Box>
                  </Box>
                  <Box className="flex text-white align-baseline gap-3">
                    <Box>
                      <MdOutlineAspectRatio
                        className="relative top-0"
                        size={28}
                        fill="#C5CBF5"
                      />
                    </Box>
                    <Box>
                      <Box className="flex gap-1">
                        <Heading className="text-[24px] font-[600]">
                          782<span className="text-[16px]">km2</span>
                        </Heading>
                        <InfoOutlineIcon w={3} h={3} color={"#C5CBF5"} />
                      </Box>
                      <Text className="relative -top-1 text-[14px] text-[#C5CBF5]">
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
              <Card className="border-2 border-[#5FE500] h-[132px] w-[533px] px-[24px] shadow-[0px 2px 4px -2px rgba(109, 255, 40, 0.20), 0px 4px 6px -1px rgba(0, 0, 0, 0.10)]">
                <Box className="flex items-center w-fill">
                  <Box>
                    <Box className="flex items-center justify-center h-[48px] w-[48px] rounded-full bg-[#008600]">
                      <MdOutlineAddchart className="text-white" size={24} />
                    </Box>
                  </Box>
                  <Box>
                    <CardHeader className="flex h-[20px] gap-2">
                      <Heading className="text-[#008600] text-[22px] relative top-0 font-[600]">
                        Add Data to Inventory
                      </Heading>
                    </CardHeader>
                    <CardBody className="h-[75px]">
                      <p className="text-[16px] text-[#232640]">
                        Upload data or connect third-party data to complete the
                        GPC Basic Emissions Inventory
                      </p>
                    </CardBody>
                  </Box>
                </Box>
              </Card>
              <Card className="h-[132px] w-[533px] px-[24px] shadow-[0px 2px 4px -2px rgba(109, 255, 40, 0.20), 0px 4px 6px -1px rgba(0, 0, 0, 0.10)]">
                <Box className="flex items-center w-fill">
                  <Box>
                    <Box className="flex items-center justify-center h-[48px] w-[48px] rounded-full bg-[#2351DC]">
                      <FiDownload className="text-white" size={24} />
                    </Box>
                  </Box>
                  <Box>
                    <CardHeader className="flex h-[20px] gap-2">
                      <Heading className="text-[#2351DC] text-[22px] relative top-0 font-[600]">
                        Download
                      </Heading>
                    </CardHeader>
                    <CardBody className="h-[75px]">
                      <p className="text-[16px] text-[#232640]">
                        View and download your inventory data in CSV or GPC
                        format and share your progress
                      </p>
                    </CardBody>
                  </Box>
                </Box>
              </Card>
            </Box>
          </Box>
        </Box>
      </section>
      <section className="h-full bg-[#fafafa] pt-[128px] pb-[100px]">
        <Box className={pageClassNames.container2}>
          <Box className="flex flex-col gap-[8px] w-full h-300">
            <Box className="flex items-center gap-3">
              <Heading className="font-[600] text-[24px]">
                GPC Basic Emission Inventory Calculation - Year 2023
              </Heading>
              <InfoOutlineIcon color={"#7A7B9A"} />
            </Box>
            <Text
              className={`font-[400] ${opensans.className} text-[16px] text-[#7A7B9A] leadin-[0.5px] `}>
              The data you have submitted is now officially incorporated into
              your city&apos;s 2023 GHG Emissions Inventory, compiled according
              to the GPC Basic methodology.{" "}
              <Link href={"/"} className="text-[#2351DC] font-[700] underline">
                Learn more
              </Link>{" "}
              about GPC Protocol
            </Text>
            <Box className="flex w-full justify-between items-center mt-2">
                {/* <Progress 
                    variant="multiSegment"
                    height={8}
                    min={0}
                    max={1000}
                    value={{
                    "red": 300,
                    "blue": 150,
                    "green": 50
                }}
                /> */}
              <Box className="w-[850px] flex rounded-full h-[16px] bg-[#24BE00]">
                <Box className="h-full w-[308px] bg-[#FA7200] rounded-[8px]" />
              </Box>
              <Heading className="font-[600] relative text-[14px]">100% completed</Heading>
            </Box>
            <Box className="flex gap-5 mt-[16px]">
              <Box className="w-[279px] flex gap-2 px-3 items-center justify-center rounded-full h-[30px] border border-[#E8EAFB]">
                <Box className="h-[12px] w-[12px]  rounded-full bg-[#FA7200]" />
                <Text className="text-[12px] relative">
                  33% Connected third-party data
                </Text>
              </Box>
              <Box className="w-[192px] flex gap-2 px-3 items-center justify-center rounded-full h-[30px] border border-[#E8EAFB]">
                <Box className="h-[12px] w-[12px]  rounded-full bg-[#24BE00]" />
                <Text className="text-[12px] relative">66% Uploaded data</Text>
              </Box>
            </Box>
            <Box className=" flex flex-col gap-[24px] py-[48px]">
              <Heading className="text-[16px] font-[600]">
                Sectors required from inventory
              </Heading>
              <Box className="w-full flex flex-col min-h-[268px] bg-white rounded-lg px-6 py-8">
                <Box className="flex gap-5">
                  <Box className="flex items-start mt-2">
                    <TbBuildingCommunity color="#2351DC" size={32} />
                  </Box>
                  <Box className="">
                    <Box className="flex items-center justify-between">
                      <Box className="flex flex-col">
                        <Box className="flex gap-2 py-1 w-[715px]">
                          <Heading className="font-[600] text-[22px]">
                            Stationary Energy
                          </Heading>
                        </Box>
                        <Text className="text-[#7A7B9A] mb-[16px]">
                          This sector deals with emissions that result from the
                          generation of electricity, heat, and steam, as well as
                          their consumption.
                        </Text>
                        <Heading className="font-[600] text-[14px]">
                          Scope Required for GPC Basic Inventory: 1, 2
                        </Heading>
                      </Box>
                      <Box>
                        <Button className="border-2 bg-white border-[#2351DC] w-[256px] h-[48px] rounded-full gap-2">
                          <Heading className="text-[#2351DC] text-[14px] relative">
                            ADD DATA TO SECTOR
                          </Heading>
                          <MdArrowForward color="#2351DC" />
                        </Button>
                      </Box>
                    </Box>
                    <Box className="flex w-full justify-between items-center just">
                      <Box className="w-[848px] flex rounded-full h-[8px] bg-[#24BE00]">
                        <Box className="h-full w-[239px] rounded-l-full bg-[#FA7200]" />
                      </Box>
                      <Text className="font-[600] relative text-[14px]">
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
                        className="flex justify-center"
                        background="none"
                        color="#7A7B9A"
                        gap={2}>
                        <Box>VIEW MORE</Box>
                        <AccordionIcon h={7} w={7} />
                      </AccordionButton>
                    </AccordionItem>
                  </Accordion>
                </Box>
              </Box>
                <Box className="w-full flex flex-col gap-5 min-h-[268px] bg-white rounded-lg px-6 py-8">
                    <Box className='flex gap-5'>
                        <Box className="flex items-start mt-2">
                            <BsTruck color="#2351DC" size={32} />
                        </Box>
                        <Box className="">
                        <Box className="flex items-center justify-between">
                            <Box className="flex flex-col">
                            <Box className="flex gap-2 py-1 w-[715px]">
                                <Text className="font-[600] text-[22px]">
                                Transportation
                                </Text>
                            </Box>
                            <Text className="text-[#7A7B9A] mb-[16px]">
                                This sector deals with emissions from the transportation
                                of goods and people within the city boundary.
                            </Text>
                            <Text className="font-[600]">
                                Scope Required for GPC Basic Inventory: 1, 2
                            </Text>
                            </Box>
                            <Box>
                            <Button className="border-2 bg-white border-[#2351DC] w-[256px] h-[48px] rounded-full gap-2">
                                <Text className="text-[#2351DC] text-[14px] relative">
                                ADD DATA TO SECTOR
                                </Text>
                                <MdArrowForward color="#2351DC" />
                            </Button>
                            </Box>
                        </Box>
                        <Box className="flex w-full justify-between items-center just">
                            <Box className="w-[848px] flex rounded-full h-[8px] bg-[#24BE00]"></Box>
                            <Text className="font-[600] relative text-[14px]">
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
                                        title="Sub-sector A"
                                        scopes="1, 2"
                                    />
                                    <SubSectorCard
                                        title="Sub-sector B"
                                        scopes="1, 2"
                                    />
                                    <SubSectorCard
                                        title="Sub-sector C"
                                        scopes="1, 2"
                                    />
                                </Box>
                            </AccordionPanel>
                            <AccordionButton
                                className="flex justify-center"
                                background="none"
                                color="#7A7B9A"
                                gap={2}>
                                <Box>VIEW MORE</Box>
                                <AccordionIcon h={7} w={7} />
                            </AccordionButton>
                            </AccordionItem>
                        </Accordion>
                </Box>
              </Box>
              <Box className="w-full flex flex-col gap-5 min-h-[268px] bg-white rounded-lg px-6 py-8">
                <Box className='flex gap-5'>
                    <Box className="flex items-start mt-2">
                    <PiTrashLight color="#2351DC" size={32} />
                    </Box>
                    <Box className="">
                    <Box className="flex items-center justify-between">
                        <Box className="flex flex-col">
                        <Box className="flex gap-2 py-1 w-[715px]">
                            <Text className="font-[600] text-[22px]">
                            Waste and wastewater
                            </Text>
                        </Box>
                        <Text className="text-[#7A7B9A] mb-[16px]">
                            This sector covers emissions generated from waste
                            management processes.
                        </Text>
                        <Text className="font-[600]">
                            Scope Required for GPC Basic Inventory: 1, 2
                        </Text>
                        </Box>
                        <Box>
                        <Button className="border-2 bg-white border-[#2351DC] w-[256px] h-[48px] rounded-full gap-2">
                            <Text className="text-[#2351DC] text-[14px] relative">
                            ADD DATA TO SECTOR
                            </Text>
                            <MdArrowForward color="#2351DC" />
                        </Button>
                        </Box>
                    </Box>
                    <Box className="flex w-full justify-between items-center just">
                        <Box className="w-[848px] flex rounded-full h-[8px] bg-[#24BE00]"></Box>
                        <Text className="font-[600] relative text-[14px]">
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
                                    title="Sub-sector A"
                                    scopes="1, 2"
                                />
                                <SubSectorCard
                                    title="Sub-sector B"
                                    scopes="1, 2"
                                />
                                <SubSectorCard
                                    title="Sub-sector C"
                                    scopes="1, 2"
                                />
                            </Box>
                        </AccordionPanel>
                        <AccordionButton
                            className="flex justify-center"
                            background="none"
                            color="#7A7B9A"
                            gap={2}>
                            <Box>VIEW MORE</Box>
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
