"use client";

import SubSectorCard from "@/components/Cards/SubSectorCard";
import FileDataCard from "@/components/Cards/file-data-card";
import ThirdPartyDataCard from "@/components/Cards/third-party-data-card";
import { BuildingIcon } from "@/components/icons";
import Wrapper from "@/components/wrapper";
import { useTranslation } from "@/i18n/client";
import { ArrowBackIcon } from "@chakra-ui/icons";
import {
  Box,
  Button,
  Card,
  Heading,
  Icon,
  IconButton,
  Text,
} from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { BsTrash2 } from "react-icons/bs";
import { FaRegTrashAlt, FaTrash } from "react-icons/fa";
import { FiTrash, FiTrash2 } from "react-icons/fi";
import { MdOutlineEdit } from "react-icons/md";

export default function ReviewPage({
  params: { lng },
}: {
  params: { lng: string };
}) {
  const router = useRouter();
  const onBack = () => {
    router.push("/data/3");
  };
  const onDiscard = () => {
    router.push("/data");
  };
  return (
    <Wrapper>
      <Box display="flex" flexDirection="column" gap="48px" pb="60px">
        <Box
          display="flex"
          flexDirection="column"
          justifyContent="center"
          gap="48px"
        >
          <Button variant="ghost" w="152px" gap="8px" onClick={onBack}>
            <ArrowBackIcon color="content.link" w="24px" h="24px" />
            <Heading
              color="content.link"
              fontSize="body.md"
              fontWeight="bold"
              textTransform="uppercase"
              fontStyle="normal"
              lineHeight="16px"
              letterSpacing="1.25px"
            >
              go back
            </Heading>
          </Button>
          <Box>
            <Heading
              color="content.primary"
              fontSize="headline.lg"
              fontWeight="bold"
              textTransform="capitalize"
              fontStyle="normal"
              lineHeight="40px"
              letterSpacing="1.25px"
            >
              review the data you have just added
            </Heading>
          </Box>
        </Box>
        <Box display="flex" flexDirection="column" gap="24px">
          <Card shadow="none" gap="24px">
            <Box display="flex" justifyContent="space-between">
              <Box display="flex" gap="16px">
                <Box>
                  <BuildingIcon />
                </Box>
                <Box display="flex" flexDirection="column" gap="8px">
                  <Text
                    fontFamily="heading"
                    color="content.secondary"
                    fontSize="headline.sm"
                    fontWeight="bold"
                    textTransform="capitalize"
                    fontStyle="normal"
                    lineHeight="32px"
                    letterSpacing="wide"
                  >
                    stationay energy
                  </Text>
                  <Text
                    fontFamily="heading"
                    color="content.tertiary"
                    fontSize="label.lg"
                    fontWeight="semibold"
                    textTransform="capitalize"
                    fontStyle="normal"
                    lineHeight="20px"
                    letterSpacing="wide"
                  >
                    Scope Required for GPC Basic Inventory: 1, 2
                  </Text>
                </Box>
              </Box>
              <Box display="flex" gap="16px">
                <Button
                  color="sentiment.negativeDefault"
                  variant="ghost"
                  w="298px"
                  gap="8px"
                >
                  <FaRegTrashAlt size="24px" />
                  <Heading
                    fontSize="button.md"
                    fontWeight="bold"
                    textTransform="uppercase"
                    fontStyle="normal"
                    lineHeight="16px"
                    letterSpacing="1.25px"
                  >
                    discard sector changes
                  </Heading>
                </Button>
                <Button
                  color="interactive.secondary"
                  variant="ghost"
                  w="181px"
                  gap="8px"
                >
                  <MdOutlineEdit size="24px" />
                  <Heading
                    fontSize="button.md"
                    fontWeight="bold"
                    textTransform="uppercase"
                    fontStyle="normal"
                    lineHeight="16px"
                    letterSpacing="1.25px"
                  >
                    edit sector
                  </Heading>
                </Button>
              </Box>
            </Box>
            <Box display="flex" flexDirection="column" gap="24px">
              <Text
                fontSize="label.lg"
                fontWeight="bold"
                fontStyle="normal"
                fontFamily="heading"
                lineHeight="20px"
                letterSpacing="wide"
              >
                Third-party data connected (3)
              </Text>
              <Box
                display="grid"
                gridTemplateColumns="auto auto auto"
                gap="8px"
              >
                <ThirdPartyDataCard />
                <ThirdPartyDataCard />
                <ThirdPartyDataCard />
                <ThirdPartyDataCard />
              </Box>
            </Box>
            <Box display="flex" flexDirection="column" gap="24px">
              <Text
                fontSize="label.lg"
                fontWeight="bold"
                fontStyle="normal"
                fontFamily="heading"
                lineHeight="20px"
                letterSpacing="wide"
              >
                Data by subsector uploaded (2)
              </Text>
              <Box
                display="grid"
                gridTemplateColumns="auto auto auto"
                gap="8px"
              >
                <ThirdPartyDataCard />
                <ThirdPartyDataCard />
                <ThirdPartyDataCard />
                <ThirdPartyDataCard />
              </Box>
            </Box>
            <Box display="flex" flexDirection="column" gap="24px">
              <Text
                fontSize="label.lg"
                fontWeight="bold"
                fontStyle="normal"
                fontFamily="heading"
                lineHeight="20px"
                letterSpacing="wide"
              >
                Data files uploaded (3)
              </Text>
              <Box
                display="grid"
                gridTemplateColumns="auto auto auto"
                gap="8px"
              >
                <FileDataCard />
                <FileDataCard />
                <FileDataCard />
                <FileDataCard />
              </Box>
            </Box>
          </Card>
          <Card shadow="none" gap="24px" p="24px">
            <Box display="flex" justifyContent="space-between">
              <Box display="flex" gap="16px">
                <Box>
                  <BuildingIcon />
                </Box>
                <Box display="flex" flexDirection="column" gap="8px">
                  <Text
                    fontFamily="heading"
                    color="content.secondary"
                    fontSize="headline.sm"
                    fontWeight="bold"
                    textTransform="capitalize"
                    fontStyle="normal"
                    lineHeight="32px"
                    letterSpacing="wide"
                  >
                    Transportation
                  </Text>
                  <Text
                    fontFamily="heading"
                    color="content.tertiary"
                    fontSize="label.lg"
                    fontWeight="semibold"
                    textTransform="capitalize"
                    fontStyle="normal"
                    lineHeight="20px"
                    letterSpacing="wide"
                  >
                    Scope Required for GPC Basic Inventory: 1, 2
                  </Text>
                </Box>
              </Box>
              <Box display="flex" gap="16px">
                <Button
                  color="sentiment.negativeDefault"
                  variant="ghost"
                  w="298px"
                  gap="8px"
                >
                  <FaRegTrashAlt size="24px" />
                  <Heading
                    fontSize="button.md"
                    fontWeight="bold"
                    textTransform="uppercase"
                    fontStyle="normal"
                    lineHeight="16px"
                    letterSpacing="1.25px"
                  >
                    discard sector changes
                  </Heading>
                </Button>
                <Button
                  color="interactive.secondary"
                  variant="ghost"
                  w="181px"
                  gap="8px"
                >
                  <MdOutlineEdit size="24px" />
                  <Heading
                    fontSize="button.md"
                    fontWeight="bold"
                    textTransform="uppercase"
                    fontStyle="normal"
                    lineHeight="16px"
                    letterSpacing="1.25px"
                  >
                    edit sector
                  </Heading>
                </Button>
              </Box>
            </Box>
            <Box display="flex" flexDirection="column" gap="24px">
              <Text
                fontSize="label.lg"
                fontWeight="bold"
                fontStyle="normal"
                fontFamily="heading"
                lineHeight="20px"
                letterSpacing="wide"
              >
                Data by subsector (1)
              </Text>
              <Box
                display="grid"
                gridTemplateColumns="auto auto auto"
                gap="8px"
              >
                <SubSectorCard isCompleted scopes="1,2" title="on-road" />
                <SubSectorCard isCompleted scopes="1,2" title="Railways" />
                <SubSectorCard isCompleted scopes="1,2" title="off-road" />
                <SubSectorCard
                  isCompleted
                  scopes="1,2"
                  title="Waterbone navigation"
                />
              </Box>
            </Box>
          </Card>
          <Card shadow="none" gap="24px" p="24px">
            <Box display="flex" justifyContent="space-between">
              <Box display="flex" gap="16px">
                <Box>
                  <BuildingIcon />
                </Box>
                <Box display="flex" flexDirection="column" gap="8px">
                  <Text
                    fontFamily="heading"
                    color="content.secondary"
                    fontSize="headline.sm"
                    fontWeight="bold"
                    textTransform="capitalize"
                    fontStyle="normal"
                    lineHeight="32px"
                    letterSpacing="wide"
                  >
                    Waste And Wastewater
                  </Text>
                  <Text
                    fontFamily="heading"
                    color="content.tertiary"
                    fontSize="label.lg"
                    fontWeight="semibold"
                    textTransform="capitalize"
                    fontStyle="normal"
                    lineHeight="20px"
                    letterSpacing="wide"
                  >
                    Scope Required for GPC Basic Inventory: 1, 2
                  </Text>
                </Box>
              </Box>
              <Box display="flex" gap="16px">
                <Button
                  color="sentiment.negativeDefault"
                  variant="ghost"
                  w="298px"
                  gap="8px"
                >
                  <FaRegTrashAlt size="24px" />
                  <Heading
                    fontSize="button.md"
                    fontWeight="bold"
                    textTransform="uppercase"
                    fontStyle="normal"
                    lineHeight="16px"
                    letterSpacing="1.25px"
                  >
                    discard sector changes
                  </Heading>
                </Button>
                <Button
                  color="interactive.secondary"
                  variant="ghost"
                  w="181px"
                  gap="8px"
                >
                  <MdOutlineEdit size="24px" />
                  <Heading
                    fontSize="button.md"
                    fontWeight="bold"
                    textTransform="uppercase"
                    fontStyle="normal"
                    lineHeight="16px"
                    letterSpacing="1.25px"
                  >
                    edit sector
                  </Heading>
                </Button>
              </Box>
            </Box>
            <Box display="flex" flexDirection="column" gap="24px">
              <Text
                fontSize="label.lg"
                fontWeight="bold"
                fontStyle="normal"
                fontFamily="heading"
                lineHeight="20px"
                letterSpacing="wide"
              >
                Third party data connected (1)
              </Text>
              <Box
                display="grid"
                gridTemplateColumns="auto auto auto"
                gap="8px"
              >
                <ThirdPartyDataCard />
              </Box>
            </Box>
          </Card>
          <div className="bg-white w-full h-[128px] flex items-center fixed bottom-0 left-0 border-t-4 border-brand  drop-shadow-2xl hover:drop-shadow-4xl transition-all">
            <Box className="w-[1090px] max-w-full mx-auto flex flex-row flex-wrap gap-y-2">
              <Box className="grow w-full md:w-0">
                <Text fontSize="sm">Review and add data</Text>
                <Text fontSize="2xl" as="b">
                  2023 Emissions Inventory
                </Text>
              </Box>
              <Button
                h={16}
                variant="ghost"
                onClick={onDiscard}
                leftIcon={<Icon as={FiTrash2} boxSize={6} />}
                size="sm"
                px={8}
                mr={4}
                borderWidth="2px"
                borderColor="sentiment.negativeDefault"
                color="sentiment.negativeDefault"
              >
                discard all changes
              </Button>
              <Button
                h={16}
                // isLoading={isConfirming}
                px={8}
                // onClick={onConfirm}
                size="sm"
              >
                confirm and add data
              </Button>
            </Box>
          </div>
        </Box>
      </Box>
    </Wrapper>
  );
}
