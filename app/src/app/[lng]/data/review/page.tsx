"use client";

import FileDataCard from "@/components/Cards/file-data-card";

import { BuildingIcon } from "@/components/icons";
import Wrapper from "@/components/wrapper";
import { useTranslation } from "@/i18n/client";
import { RootState } from "@/lib/store";

import { ArrowBackIcon } from "@chakra-ui/icons";
import { Box, Button, Card, Heading, Icon, Text } from "@chakra-ui/react";
import { useRouter } from "next/navigation";

import { FaRegTrashAlt, FaTrash } from "react-icons/fa";
import { FiTrash, FiTrash2 } from "react-icons/fi";
import { MdOutlineEdit } from "react-icons/md";
import { useSelector, useDispatch } from "react-redux";
import { clear, removeSectorData } from "@/features/city/inventoryDataSlice";
import { api } from "@/services/api";
import { appendFileToFormData } from "@/util/helpers";

export default function ReviewPage({
  params: { lng },
}: {
  params: { lng: string };
}) {
  const { t } = useTranslation(lng, "data");
  const router = useRouter();
  const dispatch = useDispatch();
  const getAllSectorData = useSelector(
    (state: RootState) => state.inventoryData.sectors,
  );
  const onBack = () => {
    router.push("/data/3");
  };
  const onDiscard = () => {
    dispatch(clear());
  };

  const stationaryEnergy = getAllSectorData.filter(
    (sector) => sector.sectorName === "Stationary Energy",
  );
  const transportation = getAllSectorData.filter(
    (sector) => sector.sectorName === "Transportation",
  );
  const waterAndWasteWater = getAllSectorData.filter(
    (sector) => sector.sectorName === "Waste and wastewater",
  );

  const onDiscardSectorChanges = (sector: string) => {
    dispatch(removeSectorData({ sectorName: sector }));
  };

  const [addUserFile] = api.useAddUserFileMutation();

  const defaultStatus = "pending";

  console.log(getAllSectorData);

  const onConfirm = async () => {
    try {
      for (const sector of getAllSectorData) {
        const formData = new FormData();
        for (const fileData of sector.files) {
          const file = appendFileToFormData(
            fileData.data,
            `${fileData.fileName}.${fileData.fileType}`,
          );
          formData.append("userId", fileData.userId!);
          formData.append("fileName", fileData.fileName!);
          formData.append("sector", fileData.sector!);
          formData.append("status", defaultStatus);
          formData.append("fileReference", "");
          formData.append("url", fileData.url!);
          formData.append("gpcRefNo", "");
          formData.append("data", file, file.name);
        }

        await addUserFile(formData).then(() => {
          // TODO
          // Trigger notification to user
        });
      }
    } catch (error) {
      console.error(error);
      // TODO
      // Trigger notification to user
    } finally {
      router.push("/");
      dispatch(clear());
    }
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
              {t("go-back")}
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
              {t("review-your-data-heading")}
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
                    {t("stationary-energy")}
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
                    {t("gpc-scope-required")}
                  </Text>
                </Box>
              </Box>
              <Box display="flex" gap="16px">
                <Button
                  color="sentiment.negativeDefault"
                  variant="ghost"
                  w="298px"
                  gap="8px"
                  onClick={() => onDiscardSectorChanges("Stationary Energy")}
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
                    {t("discard-sector-changes")}
                  </Heading>
                </Button>
                <Button
                  color="interactive.secondary"
                  variant="ghost"
                  w="181px"
                  gap="8px"
                  onClick={() => router.push("/data/1")}
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
                    {t("edit-sector")}
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
                {t("third-party-data")} (0)
              </Text>
              <Box
                display="grid"
                gridTemplateColumns="auto auto auto"
                gap="8px"
              >
                {/* TODO: show connected third party data */}
                {/* <ThirdPartyDataCard /> */}
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
                {t("data-by-subsector")} (0)
              </Text>
              <Box
                display="grid"
                gridTemplateColumns="auto auto auto"
                gap="8px"
              >
                {/* TODO: show sector data*/}
                {/* <ThirdPartyDataCard /> */}
              </Box>
            </Box>
            {stationaryEnergy[0]?.files.length && (
              <Box display="flex" flexDirection="column" gap="24px">
                <Text
                  fontSize="label.lg"
                  fontWeight="bold"
                  fontStyle="normal"
                  fontFamily="heading"
                  lineHeight="20px"
                  letterSpacing="wide"
                >
                  {t("data-files-uploaded")} ({stationaryEnergy[0].files.length}
                  )
                </Text>
                <Box
                  display="grid"
                  gridTemplateColumns="auto auto auto"
                  gap="8px"
                >
                  {stationaryEnergy[0]?.files.map((file: any, i: number) => (
                    <FileDataCard
                      key={i}
                      fileName={file.fileName}
                      fileSize={file.size}
                    />
                  ))}
                </Box>
              </Box>
            )}
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
                    {t("transportation")}
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
                    {t("gpc-scope-required")}
                  </Text>
                </Box>
              </Box>
              <Box display="flex" gap="16px">
                <Button
                  color="sentiment.negativeDefault"
                  variant="ghost"
                  w="298px"
                  gap="8px"
                  onClick={() => onDiscardSectorChanges("Transportation")}
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
                    {t("discard-sector-changes")}
                  </Heading>
                </Button>
                <Button
                  color="interactive.secondary"
                  variant="ghost"
                  w="181px"
                  gap="8px"
                  onClick={() => router.push("/data/2")}
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
                    {t("edit-sector")}
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
                {t("data-by-subsector")}
              </Text>
              <Box
                display="grid"
                gridTemplateColumns="auto auto auto"
                gap="8px"
              >
                {/* TODO: show sector data*/}

                {/* <SubSectorCard isCompleted scopes="1,2" title="on-road" /> */}
              </Box>
              {transportation[0]?.files.length && (
                <Box display="flex" flexDirection="column" gap="24px">
                  <Text
                    fontSize="label.lg"
                    fontWeight="bold"
                    fontStyle="normal"
                    fontFamily="heading"
                    lineHeight="20px"
                    letterSpacing="wide"
                  >
                    {t("data-files-uploaded")}({transportation[0].files.length})
                  </Text>
                  <Box
                    display="grid"
                    gridTemplateColumns="auto auto auto"
                    gap="8px"
                  >
                    {transportation[0]?.files.map((file: any, i: number) => (
                      <FileDataCard
                        key={i}
                        fileName={file.fileName}
                        fileSize={file.size}
                      />
                    ))}
                  </Box>
                </Box>
              )}
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
                    {t("water-and-wastewater")}
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
                    {t("gpc-scope-required")}
                  </Text>
                </Box>
              </Box>
              <Box display="flex" gap="16px">
                <Button
                  color="sentiment.negativeDefault"
                  variant="ghost"
                  w="298px"
                  gap="8px"
                  onClick={() => onDiscardSectorChanges("Waste and wastewater")}
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
                    {t("discard-sector-changes")}
                  </Heading>
                </Button>
                <Button
                  color="interactive.secondary"
                  variant="ghost"
                  w="181px"
                  gap="8px"
                  onClick={() => router.push("/data/3")}
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
                    {t("edit-sector")}
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
                {t("third-party-data")}
                (0)
              </Text>
              <Box
                display="grid"
                gridTemplateColumns="auto auto auto"
                gap="8px"
              >
                {/* TODO: show connected third party data */}
                {/* <ThirdPartyDataCard /> */}
              </Box>
              <Text
                fontSize="label.lg"
                fontWeight="bold"
                fontStyle="normal"
                fontFamily="heading"
                lineHeight="20px"
                letterSpacing="wide"
              >
                {t("data-by-subsector")}
                (0)
              </Text>
              <Box
                display="grid"
                gridTemplateColumns="auto auto auto"
                gap="8px"
              >
                {/* TODO: show sector data*/}

                {/* <SubSectorCard isCompleted scopes="1,2" title="on-road" /> */}
              </Box>
              {waterAndWasteWater[0]?.files.length && (
                <Box display="flex" flexDirection="column" gap="24px">
                  <Text
                    fontSize="label.lg"
                    fontWeight="bold"
                    fontStyle="normal"
                    fontFamily="heading"
                    lineHeight="20px"
                    letterSpacing="wide"
                  >
                    {t("data-files-uploaded")}(
                    {waterAndWasteWater[0].files.length})
                  </Text>
                  <Box
                    display="grid"
                    gridTemplateColumns="auto auto auto"
                    gap="8px"
                  >
                    {waterAndWasteWater[0]?.files.map(
                      (file: any, i: number) => (
                        <FileDataCard
                          key={i}
                          fileName={file.fileName}
                          fileSize={file.size}
                        />
                      ),
                    )}
                  </Box>
                </Box>
              )}
            </Box>
          </Card>
          <div className="bg-white w-full h-[128px] flex items-center fixed bottom-0 left-0 border-t-4 border-brand  drop-shadow-2xl hover:drop-shadow-4xl transition-all">
            <Box className="w-[1090px] max-w-full mx-auto flex flex-row flex-wrap gap-y-2">
              <Box className="grow w-full md:w-0">
                <Text fontSize="sm">{t("review-data-label")}</Text>
                <Text fontSize="2xl" as="b">
                  2023 {t("emissions-inventory-title")}
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
                {t("discard-all-changes")}
              </Button>
              <Button
                h={16}
                // isLoading={isConfirming}
                px={8}
                onClick={onConfirm}
                size="sm"
              >
                {t("confirm-and-add-data")}
              </Button>
            </Box>
          </div>
        </Box>
      </Box>
    </Wrapper>
  );
}
