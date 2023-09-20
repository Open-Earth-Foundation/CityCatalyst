"use client";

import { SectorCard } from "@/components/Cards/SectorCard";
import { CityMap } from "@/components/CityMap";
import Footer from "@/components/Sections/Footer";
import { SegmentedProgress } from "@/components/SegmentedProgress";
import { CircleIcon } from "@/components/icons";
import { NavigationBar } from "@/components/navigation-bar";
import { api } from "@/services/api";
import { formatPercent } from "@/util/helpers";
import { InfoOutlineIcon } from "@chakra-ui/icons";
import {
  Avatar,
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  Center,
  Heading,
  Icon,
  Link,
  Spinner,
  Tag,
  TagLabel,
  TagLeftIcon,
  Text,
  useToast,
} from "@chakra-ui/react";
import Image from "next/image";
import NextLink from "next/link";
import { FiDownload } from "react-icons/fi";
import {
  MdArrowOutward,
  MdCheckCircleOutline,
  MdGroup,
  MdOutlineAddchart,
  MdOutlineAspectRatio,
} from "react-icons/md";

enum STATUS {
  INFO = "info",
  SUCCESS = "success",
  ERROR = "error",
}

const CITY_INTENTORY_YEAR = "DE_BER";

export default function Home({ params: { lng } }: { params: { lng: string } }) {
  const toast = useToast();

  // query API data
  // TODO get these from user record
  const locode = "XX_INVENTORY_CITY";
  const year = 3000;
  const { data: inventory, isLoading: isInventoryLoading } =
    api.useGetInventoryQuery({ locode, year });
  const { data: inventoryProgress, isLoading: isInventoryProgressLoading } =
    api.useGetInventoryProgressQuery({ locode, year });
  let totalProgress = 0,
    thirdPartyProgress = 0,
    uploadedProgress = 0;
  if (inventoryProgress && inventoryProgress.totalProgress.total > 0) {
    const { uploaded, thirdParty, total } = inventoryProgress.totalProgress;
    totalProgress = (uploaded + thirdParty) / total;
    thirdPartyProgress = thirdParty / total;
    uploadedProgress = uploaded / total;
  }

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
        console.error("Download error:", error);
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
                    {inventory?.city?.name}
                    Ciudad Autónoma de Buenos Aires
                  </Heading>
                </Box>
                <Box className="flex gap-8 mt-[24px]">
                  <Box className="flex align-baseline gap-3">
                    <Icon
                      as={MdArrowOutward}
                      boxSize={6}
                      fill="interactive.accent"
                    />
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
                        Total emissions in {year}
                      </Text>
                    </Box>
                  </Box>
                  <Box className="flex align-baseline gap-3">
                    <Icon
                      as={MdGroup}
                      boxSize={6}
                      fill="background.overlay"
                    />
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
                    <Icon
                      as={MdOutlineAspectRatio}
                      boxSize={6}
                      fill="background.overlay"
                    />
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
              <CityMap locode={locode} width={422} height={317} />
            </Box>
            <Box className="flex gap-[24px] relative justify-between top-[100px]">
              <NextLink href="/data">
                <Card
                  shadow="2dp"
                  backgroundColor="base.light"
                  borderColor="interactive.accent"
                  borderWidth="thin"
                  className="h-[132px] w-[533px] hover:shadow-xl"
                  py={0}
                  px={6}
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
                  className="h-[132px] w-[533px] hover:shadow-xl"
                  py={0}
                  px={6}
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
                GPC Basic Emission Inventory Calculation - Year {year}
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
              your city&apos;s {year} GHG Emissions Inventory, compiled
              according to the GPC Basic methodology.{" "}
              <Link
                href={"/"}
                fontWeight="bold"
                color="brand.secondary"
                className="font-[700] underline"
              >
                Learn more
              </Link>{" "}
              about GPC Protocol
            </Text>
            <Box className="flex w-full justify-between items-center mt-2 gap-6">
              <SegmentedProgress
                values={[thirdPartyProgress, uploadedProgress]}
                colors={["interactive.connected", "interactive.tertiary"]}
              />
              <Heading
                fontWeight="semibold"
                fontSize="body.md"
                className="whitespace-nowrap"
              >
                {formatPercent(totalProgress)}% completed
              </Heading>
            </Box>
            <Box className="flex gap-4 mt-2">
              <Tag>
                <TagLeftIcon
                  as={CircleIcon}
                  boxSize={6}
                  color="interactive.connected"
                />
                <TagLabel>
                  {formatPercent(thirdPartyProgress)}% Connected third-party
                  data
                </TagLabel>
              </Tag>
              <Tag>
                <TagLeftIcon
                  as={CircleIcon}
                  boxSize={6}
                  color="interactive.tertiary"
                />
                <TagLabel>
                  {formatPercent(uploadedProgress)}% Uploaded data
                </TagLabel>
              </Tag>
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
              {isInventoryProgressLoading ? (
                <Center>
                  <Spinner size="lg" />
                </Center>
              ) : (
                inventoryProgress?.sectorProgress.map((sectorProgress, i) => (
                  <SectorCard
                    key={i}
                    sectorProgress={sectorProgress}
                    stepNumber={i + 1}
                  />
                ))
              )}
            </Box>
          </Box>
        </Box>
      </section>
      <Footer />
    </>
  );
}
