"use client";

import { useTranslation } from "@/i18n/client";
import { MdArrowBack, MdArrowForward } from "react-icons/md";
import { Box, Icon, Text, useSteps } from "@chakra-ui/react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import React, { use, useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ProgressSteps from "@/components/steps/progress-steps";
import { Button } from "@/components/ui/button";
import { UseErrorToast, UseInfoToast, UseSuccessToast } from "@/hooks/Toasts";
import UploadFileStep from "@/components/steps/GHGI/import/upload-file-step";
import ValidationResultsStep from "@/components/steps/GHGI/import/validation-results-step";
import MappingColumnsStep from "@/components/steps/GHGI/import/mapping-columns-step";
import ReviewConfirmStep from "@/components/steps/GHGI/import/review-confirm-step";
import DataLossWarningModal from "@/components/Modals/data-loss-warning-modal";
import { api } from "@/services/api";
import { logger } from "@/services/logger";
import { TFunction } from "i18next";

function ImportButton({
  cityId,
  inventoryId,
  importedFileId,
  mappingOverrides,
  onImport,
  t,
}: {
  cityId: string;
  inventoryId: string;
  importedFileId: string;
  mappingOverrides: Record<string, string>;
  onImport: () => void;
  t: TFunction;
}) {
  const [approveImport, { isLoading: isImporting }] =
    api.useApproveImportMutation();

  const makeErrorToast = (title: string, description?: string) => {
    const { showErrorToast } = UseErrorToast({ description, title });
    showErrorToast();
  };

  const makeSuccessToast = (title: string, description?: string) => {
    const { showSuccessToast } = UseSuccessToast({ description, title });
    showSuccessToast();
  };

  const handleImport = async () => {
    if (!importedFileId) return;

    const overridesToSend = Object.fromEntries(
      Object.entries(mappingOverrides).filter(([, v]) => v !== ""),
    );

    try {
      await approveImport({
        cityId,
        inventoryId,
        importedFileId,
        mappingOverrides: Object.keys(overridesToSend).length
          ? overridesToSend
          : undefined,
      }).unwrap();

      makeSuccessToast("Import completed", "Your inventory data has been imported successfully.");
      onImport();
    } catch (error: any) {
      makeErrorToast(
        "Import failed",
        error?.data?.message || error?.message || "Failed to import data",
      );
    }
  };

  return (
    <Button
      w="auto"
      gap="8px"
      py="16px"
      px="24px"
      onClick={handleImport}
      h="64px"
      loading={isImporting}
      disabled={isImporting}
    >
      <Text
        fontFamily="button.md"
        fontWeight="600"
        letterSpacing="wider"
      >
        {t("import-inventory")}
      </Text>
      <MdArrowForward height="24px" width="24px" />
    </Button>
  );
}

export default function ImportPage(props: {
  params: Promise<{ lng: string; cityId: string }>;
}) {
  const { lng, cityId } = use(props.params);
  const { t } = useTranslation(lng, "onboarding");
  const router = useRouter();
  const searchParams = useSearchParams();
  const inventoryId = searchParams.get("inventory");

  const steps = [
    { title: t("upload-file-step") },
    { title: t("validation-results-step") },
    { title: t("mapping-columns-step") },
    { title: t("review-confirm-step") },
  ];

  const {
    value: activeStep,
    goToNextStep,
    goToPrevStep,
    setStep,
  } = useSteps({
    defaultStep: 0,
    count: steps.length,
  });

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [importedFileId, setImportedFileId] = useState<string | null>(null);
  const [pdfPendingExtraction, setPdfPendingExtraction] = useState(false);
  const [tabularPendingInterpretation, setTabularPendingInterpretation] =
    useState(false);
  const [isExtractInProgress, setIsExtractInProgress] = useState(false);
  const [isInterpretInProgress, setIsInterpretInProgress] = useState(false);
  const [mappingOverrides, setMappingOverrides] = useState<
    Record<string, string>
  >({});
  const [showDataLossModal, setShowDataLossModal] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const [extractionProgress, setExtractionProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const extractionPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const interpretPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const extractionCompleteHandledRef = useRef(false);
  const interpretCompleteHandledRef = useRef(false);
  const pathname = usePathname();
  const prevPathnameRef = useRef<string | null>(null);

  // Check if there's unsaved progress
  const hasUnsavedProgress = uploadedFile !== null || importedFileId !== null;

  const makeErrorToast = (title: string, description?: string) => {
    const { showErrorToast } = UseErrorToast({ description, title });
    showErrorToast();
  };

  const makeInfoToast = (title: string, description?: string) => {
    const { showInfoToast } = UseInfoToast({ description, title });
    showInfoToast();
  };

  const [uploadFile, { isLoading: isUploadingFile }] =
    api.useUploadInventoryFileMutation();
  const [extractImport, { isLoading: isExtracting }] =
    api.useExtractImportMutation();
  const [interpretImport, { isLoading: isInterpreting }] =
    api.useInterpretImportMutation();
  const [getImportStatus] = api.useLazyGetImportStatusQuery();

  const handleFileUpload = async (file: File) => {
    if (!inventoryId) {
      makeErrorToast("Error", "Inventory ID is required");
      return;
    }

    // Show info toast when upload starts
    makeInfoToast(
      t("upload-started"),
      t("upload-started-description", { fileName: file.name }),
    );

    try {
      const result = await uploadFile({
        cityId,
        inventoryId,
        file,
      }).unwrap();

      setUploadedFile(file);
      setImportedFileId(result.id);
      setPdfPendingExtraction(
        result.importStatus === "pending_ai_extraction" || result.fileType === "pdf",
      );
      setTabularPendingInterpretation(
        result.importStatus === "pending_ai_interpretation",
      );

      // PDF (Path C): stay on step 0 for "Extract with AI"; Path B (tabular): stay for "Interpret with AI"; eCRF: advance to step 1
      if (
        result.importStatus !== "pending_ai_extraction" &&
        result.importStatus !== "pending_ai_interpretation"
      ) {
        setTimeout(() => goToNextStep(), 150);
      }
    } catch (error: any) {
      makeErrorToast(
        "Upload failed",
        error?.data?.message || error?.message || "Failed to upload file",
      );
    }
  };

  const handleContinue = () => {
    if (activeStep < steps.length - 1) {
      // Small delay for smooth transition
      setTimeout(() => {
        goToNextStep();
      }, 80);
    }
  };

  const handleRemoveFile = () => {
    if (extractionPollRef.current) {
      clearInterval(extractionPollRef.current);
      extractionPollRef.current = null;
    }
    if (interpretPollRef.current) {
      clearInterval(interpretPollRef.current);
      interpretPollRef.current = null;
    }
    extractionCompleteHandledRef.current = false;
    interpretCompleteHandledRef.current = false;
    setIsExtractInProgress(false);
    setIsInterpretInProgress(false);
    setUploadedFile(null);
    setImportedFileId(null);
    setPdfPendingExtraction(false);
    setTabularPendingInterpretation(false);
    setStep(0);
  };

  const handleExtractWithAi = async () => {
    if (!importedFileId || !inventoryId) return;
    setIsExtractInProgress(true);
    if (extractionPollRef.current) {
      clearInterval(extractionPollRef.current);
      extractionPollRef.current = null;
    }
    extractionCompleteHandledRef.current = false;
    setExtractionProgress(null);
    extractionPollRef.current = setInterval(async () => {
      if (!cityId || !inventoryId || !importedFileId) return;
      try {
        const res = await getImportStatus({
          cityId,
          inventoryId,
          importedFileId,
        }).unwrap();
        if (extractionCompleteHandledRef.current) return;
        const progress = (res as { mappingConfiguration?: { extractionProgress?: { current: number; total?: number } } })?.mappingConfiguration?.extractionProgress;
        const total = progress?.total;
        if (progress != null && total != null && total > 1) setExtractionProgress({ current: progress.current, total });
        const status = (res as { importStatus?: string; errorLog?: string | null }).importStatus;
        const errorLog = (res as { importStatus?: string; errorLog?: string | null }).errorLog;
        if (status === "waiting_for_approval") {
          extractionCompleteHandledRef.current = true;
          if (extractionPollRef.current) {
            clearInterval(extractionPollRef.current);
            extractionPollRef.current = null;
          }
          setIsExtractInProgress(false);
          setExtractionProgress(null);
          setPdfPendingExtraction(false);
          setTimeout(() => goToNextStep(), 150);
        } else if (status === "failed") {
          extractionCompleteHandledRef.current = true;
          if (extractionPollRef.current) {
            clearInterval(extractionPollRef.current);
            extractionPollRef.current = null;
          }
          setIsExtractInProgress(false);
          setExtractionProgress(null);
          makeErrorToast(t("extraction-failed"), errorLog ?? t("ai-extraction-failed-default"));
        }
      } catch (err) {
        logger.debug({ err, cityId, inventoryId, importedFileId }, "Import status poll failed");
      }
    }, 3000);
    try {
      const result = await extractImport({
        cityId,
        inventoryId,
        importedFileId,
      }).unwrap();
      if ("accepted" in result && result.accepted) return;
      if (extractionPollRef.current) {
        clearInterval(extractionPollRef.current);
        extractionPollRef.current = null;
      }
      setIsExtractInProgress(false);
      setPdfPendingExtraction(false);
      await getImportStatus({
        cityId,
        inventoryId,
        importedFileId,
      }).unwrap();
      setTimeout(() => goToNextStep(), 150);
    } catch (error: any) {
      if (extractionPollRef.current) {
        clearInterval(extractionPollRef.current);
        extractionPollRef.current = null;
      }
      setIsExtractInProgress(false);
      setExtractionProgress(null);
      const apiMessage = error?.data?.message || error?.message || "";
      const message =
        apiMessage === "Inventory not found for the target year"
          ? t("inventory-not-found-for-target-year")
          : apiMessage || t("ai-extraction-failed-default");
      makeErrorToast(t("extraction-failed"), message);
    }
  };

  const handleInterpretWithAi = async () => {
    if (!importedFileId || !inventoryId) return;
    if (interpretPollRef.current) {
      clearInterval(interpretPollRef.current);
      interpretPollRef.current = null;
    }
    interpretCompleteHandledRef.current = false;
    setIsInterpretInProgress(true);
    makeInfoToast(
      t("interpreting-file"),
      t("interpreting-file-description"),
    );
    try {
      const result = await interpretImport({
        cityId,
        inventoryId,
        importedFileId,
      }).unwrap();
      if ("accepted" in result && result.accepted) {
        interpretPollRef.current = setInterval(async () => {
          if (!cityId || !inventoryId || !importedFileId) return;
          try {
            const res = await getImportStatus({
              cityId,
              inventoryId,
              importedFileId,
            }).unwrap();
            if (interpretCompleteHandledRef.current) return;
            const status = (res as { importStatus?: string; errorLog?: string | null }).importStatus;
            const errorLog = (res as { importStatus?: string; errorLog?: string | null }).errorLog;
            if (status === "waiting_for_approval") {
              interpretCompleteHandledRef.current = true;
              if (interpretPollRef.current) {
                clearInterval(interpretPollRef.current);
                interpretPollRef.current = null;
              }
              setIsInterpretInProgress(false);
              setTabularPendingInterpretation(false);
              setTimeout(() => goToNextStep(), 150);
            } else if (status === "failed") {
              interpretCompleteHandledRef.current = true;
              if (interpretPollRef.current) {
                clearInterval(interpretPollRef.current);
                interpretPollRef.current = null;
              }
              setIsInterpretInProgress(false);
              makeErrorToast(
                t("interpretation-failed") ?? "Interpretation failed",
                errorLog ?? t("ai-extraction-failed-default"),
              );
            }
          } catch (err) {
            logger.debug({ err, cityId, inventoryId, importedFileId }, "Interpret status poll failed");
          }
        }, 3000);
        return;
      }
      setIsInterpretInProgress(false);
      if ((result as { importStatus?: string }).importStatus === "failed") {
        const errorLog = (result as { errorLog?: string | null }).errorLog;
        makeErrorToast(
          t("interpretation-failed") ?? "Interpretation failed",
          errorLog ?? t("ai-extraction-failed-default"),
        );
        return;
      }
      setTabularPendingInterpretation(false);
      setTimeout(() => goToNextStep(), 150);
    } catch (error: any) {
      setIsInterpretInProgress(false);
      const message =
        error?.data?.message || error?.message || t("ai-extraction-failed-default");
      makeErrorToast(t("interpretation-failed") ?? "Interpretation failed", message);
    }
  };

  // Handle beforeunload event (browser refresh/close)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedProgress) {
        e.preventDefault();
        // Modern browsers ignore custom messages, but we still need to call preventDefault
        e.returnValue = "";
        return "";
      }
    };

    if (hasUnsavedProgress) {
      window.addEventListener("beforeunload", handleBeforeUnload);
      return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }
  }, [hasUnsavedProgress]);

  // Handle route changes
  useEffect(() => {
    prevPathnameRef.current = pathname;
  }, [pathname]);

  // Handle navigation attempts (back button, router.push, etc.)
  const handleNavigation = (navigationFn: () => void) => {
    if (hasUnsavedProgress) {
      setPendingNavigation(() => navigationFn);
      setShowDataLossModal(true);
    } else {
      navigationFn();
    }
  };

  const handleConfirmLeave = () => {
    setShowDataLossModal(false);
    if (pendingNavigation) {
      pendingNavigation();
      setPendingNavigation(null);
    }
  };

  const handleCancelLeave = () => {
    setShowDataLossModal(false);
    setPendingNavigation(null);
  };

  return (
    <>
      <Box pt={16} pb={16} maxW="full" mx="auto" w="1090px">
        <Button
          variant="ghost"
          onClick={() => {
            if (activeStep === 0) {
              handleNavigation(() => router.back());
            } else {
              goToPrevStep();
            }
          }}
          pl={0}
          color="content.link"
        >
          <Icon as={MdArrowBack} boxSize={6} />
          {t("go-back")}
        </Button>
        <Box
          display="flex"
          flexDirection={{ base: "column", md: "row" }}
          columnGap={{ md: "48px" }}
          rowGap={{ base: "48px", md: "0px" }}
          alignItems="flex-start"
          mt={{ base: 8, md: 16 }}
          mb={48}
          w={"1090px"}
          mx="auto"
          position="relative"
          minH="400px"
        >
          <Box w="full" position="relative" minH="400px" overflow="hidden">
            <AnimatePresence mode="wait">
              {activeStep === 0 && (
                <motion.div
                  key="step-0"
                  initial={{ opacity: 0, x: 100 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                >
                  <Box w="full" display="flex" flexDirection="column" gap="24px">
                    <UploadFileStep
                      t={t}
                      uploadedFile={uploadedFile}
                      onFileUpload={handleFileUpload}
                      onRemoveFile={handleRemoveFile}
                      isUploading={isUploadingFile}
                    />
                    {pdfPendingExtraction && (isExtracting || isExtractInProgress) && (
                      <Box w="full" mt={2}>
                        <Text fontSize="sm" color="content.tertiary" mb={2}>
                          {extractionProgress && extractionProgress.total > 1
                            ? t("extracting-chunk-progress", {
                                current: extractionProgress.current,
                                total: extractionProgress.total,
                              })
                            : t("breaking-into-chunks")}
                        </Text>
                        {extractionProgress && extractionProgress.total > 1 ? (
                          <Box
                            w="full"
                            h="8px"
                            bg="background.subtle"
                            borderRadius="10px"
                            overflow="hidden"
                          >
                            <Box
                              h="full"
                              bg="interactive.primary"
                              borderRadius="10px"
                              transition="width 0.3s ease"
                              w={`${(extractionProgress.current / extractionProgress.total) * 100}%`}
                            />
                          </Box>
                        ) : (
                          <Box
                            w="full"
                            h="8px"
                            bg="background.subtle"
                            borderRadius="10px"
                            overflow="hidden"
                            position="relative"
                          >
                            <motion.div
                              style={{
                                position: "absolute",
                                left: 0,
                                top: 0,
                                height: "100%",
                                width: "40%",
                              }}
                              animate={{ x: ["0%", "250%"] }}
                              transition={{
                                duration: 1.5,
                                repeat: Infinity,
                                ease: "easeInOut",
                              }}
                            >
                              <Box
                                h="full"
                                w="full"
                                bg="interactive.primary"
                                borderRadius="10px"
                              />
                            </motion.div>
                          </Box>
                        )}
                      </Box>
                    )}
                    {tabularPendingInterpretation && (isInterpreting || isInterpretInProgress) && (
                      <Box w="full" mt={2}>
                        <Text fontSize="sm" color="content.tertiary" mb={2}>
                          {t("interpreting-file-description")}
                        </Text>
                        <Box
                          w="full"
                          h="8px"
                          bg="background.subtle"
                          borderRadius="10px"
                          overflow="hidden"
                          position="relative"
                        >
                          <motion.div
                            style={{
                              position: "absolute",
                              left: 0,
                              top: 0,
                              height: "100%",
                              width: "40%",
                            }}
                            animate={{ x: ["0%", "250%"] }}
                            transition={{
                              duration: 1.5,
                              repeat: Infinity,
                              ease: "easeInOut",
                            }}
                          >
                            <Box
                              h="full"
                              w="full"
                              bg="interactive.primary"
                              borderRadius="10px"
                            />
                          </motion.div>
                        </Box>
                      </Box>
                    )}
                  </Box>
                </motion.div>
              )}
              {activeStep === 1 && importedFileId && inventoryId && (
                <motion.div
                  key="step-1"
                  initial={{ opacity: 0, x: 100 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                >
                  <ValidationResultsStep
                    t={t}
                    cityId={cityId}
                    inventoryId={inventoryId}
                    importedFileId={importedFileId}
                    onContinue={handleContinue}
                  />
                </motion.div>
              )}
              {activeStep === 2 && importedFileId && inventoryId && (
                <motion.div
                  key="step-2"
                  initial={{ opacity: 0, x: 100 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                >
                  <MappingColumnsStep
                    t={t}
                    cityId={cityId}
                    inventoryId={inventoryId}
                    importedFileId={importedFileId}
                    onContinue={handleContinue}
                    mappingOverrides={mappingOverrides}
                    onMappingChange={(columnName, mappedKey) => {
                      setMappingOverrides((prev) => ({
                        ...prev,
                        [columnName]: mappedKey,
                      }));
                    }}
                  />
                </motion.div>
              )}
              {activeStep === 3 && importedFileId && inventoryId && (
                <motion.div
                  key="step-3"
                  initial={{ opacity: 0, x: 100 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                >
                  <ReviewConfirmStep
                    t={t}
                    cityId={cityId}
                    inventoryId={inventoryId}
                    importedFileId={importedFileId}
                    onImport={() => {
                      // This is no longer used but kept for interface compatibility
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </Box>
        </Box>
        <Box
          bg="white"
          w="full"
          position="fixed"
          bottom={0}
          left={0}
          pb={8}
          px={1}
          zIndex={9999}
          transition="all"
          data-import-bottom-bar
        >
          <Box w="full" display="flex" flexDir="column" gap="32px">
            <Box w="full">
              <Box w="full">
                <ProgressSteps steps={steps} currentStep={activeStep} />
              </Box>
            </Box>
            <Box w="full" display="flex" justifyContent="end" px="135px">
              {activeStep === 0 && (
                <Button
                  w="auto"
                  gap="8px"
                  py="16px"
                  px="24px"
                  onClick={
                    pdfPendingExtraction
                      ? handleExtractWithAi
                      : tabularPendingInterpretation
                        ? handleInterpretWithAi
                        : handleContinue
                  }
                  h="64px"
                  disabled={
                    !uploadedFile ||
                    !importedFileId ||
                    (pdfPendingExtraction && (isExtracting || isExtractInProgress)) ||
                    (tabularPendingInterpretation && (isInterpreting || isInterpretInProgress))
                  }
                  loading={
                    (pdfPendingExtraction && (isExtracting || isExtractInProgress)) ||
                    (tabularPendingInterpretation && (isInterpreting || isInterpretInProgress))
                  }
                >
                  <Text
                    fontFamily="button.md"
                    fontWeight="600"
                    letterSpacing="wider"
                  >
                    {pdfPendingExtraction
                      ? t("extract-with-ai")
                      : tabularPendingInterpretation
                        ? t("interpret-with-ai")
                        : t("continue")}
                  </Text>
                  <MdArrowForward height="24px" width="24px" />
                </Button>
              )}
              {activeStep === 1 && (
                <Button
                  w="auto"
                  gap="8px"
                  py="16px"
                  px="24px"
                  onClick={handleContinue}
                  h="64px"
                >
                  <Text
                    fontFamily="button.md"
                    fontWeight="600"
                    letterSpacing="wider"
                  >
                    {t("continue")}
                  </Text>
                  <MdArrowForward height="24px" width="24px" />
                </Button>
              )}
              {activeStep === 2 && (
                <Button
                  w="auto"
                  gap="8px"
                  py="16px"
                  px="24px"
                  onClick={handleContinue}
                  h="64px"
                >
                  <Text
                    fontFamily="button.md"
                    fontWeight="600"
                    letterSpacing="wider"
                  >
                    {t("continue")}
                  </Text>
                  <MdArrowForward height="24px" width="24px" />
                </Button>
              )}
              {activeStep === 3 && importedFileId && inventoryId && (
                <ImportButton
                  cityId={cityId}
                  inventoryId={inventoryId}
                  importedFileId={importedFileId}
                  mappingOverrides={mappingOverrides}
                  onImport={() => {
                    router.push(`/${lng}/cities/${cityId}/GHGI`);
                  }}
                  t={t}
                />
              )}
            </Box>
          </Box>
        </Box>
      </Box>
      <DataLossWarningModal
        isOpen={showDataLossModal}
        onOpenChange={setShowDataLossModal}
        onConfirm={handleConfirmLeave}
        onCancel={handleCancelLeave}
        t={t}
      />
    </>
  );
}
