"use client";

import { useTranslation } from "@/i18n/client";
import { MdArrowBack, MdArrowForward } from "react-icons/md";
import { Box, Icon, Text, useSteps } from "@chakra-ui/react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import React, { use, useState, useEffect, useRef, useCallback } from "react";
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
import type { ImportStatusResponse } from "@/util/types";
import { usePollUntil } from "@/hooks/usePollUntil";
import { TFunction } from "i18next";

/** If errorLog starts with "i18n:", return t(key); else return errorLog or fallback. */
function resolveErrorMessage(
  errorLog: string | null | undefined,
  fallback: string,
  t: TFunction,
): string {
  if (errorLog == null || errorLog === "") return fallback;
  if (errorLog.startsWith("i18n:")) return t(errorLog.slice(5));
  return errorLog;
}

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
  const [getImportStatus] = api.useLazyGetImportStatusQuery();

  const makeErrorToast = (title: string, description?: string) => {
    const { showErrorToast } = UseErrorToast({ description, title });
    showErrorToast();
  };

  const makeSuccessToast = (title: string, description?: string) => {
    const { showSuccessToast } = UseSuccessToast({ description, title });
    showSuccessToast();
  };

  const { startPolling: startImportPolling, stopPolling: stopImportPolling, isPolling: isImportPolling } =
    usePollUntil<ImportStatusResponse>({
      fetch: () =>
        getImportStatus({ cityId, inventoryId, importedFileId }).unwrap() as Promise<ImportStatusResponse>,
      isTerminal: (res) => {
        if (res.importStatus === "completed")
          return { done: true, success: true, data: res };
        if (res.importStatus === "failed")
          return { done: true, success: false, data: res };
        return { done: false };
      },
      onSuccess: () => {
        makeSuccessToast(
          "Import completed",
          "Your inventory data has been imported successfully.",
        );
        onImport();
      },
      onFailure: (res) =>
        makeErrorToast("Import failed", resolveErrorMessage(res.errorLog, "Failed to import data", t)),
      onPollError: (err) =>
        logger.debug(
          { err, cityId, inventoryId, importedFileId },
          "Approve/import status poll failed",
        ),
      intervalMs: 3000,
    });

  const handleImport = async () => {
    if (!importedFileId) return;
    stopImportPolling();

    const overridesToSend = Object.fromEntries(
      Object.entries(mappingOverrides).filter(([, v]) => v !== ""),
    );

    try {
      const result = await approveImport({
        cityId,
        inventoryId,
        importedFileId,
        mappingOverrides: Object.keys(overridesToSend).length
          ? overridesToSend
          : undefined,
      }).unwrap();

      if ("accepted" in result && result.accepted) {
        startImportPolling();
        return;
      }

      if ((result as { importStatus?: string }).importStatus === "completed") {
        makeSuccessToast(
          "Import completed",
          "Your inventory data has been imported successfully.",
        );
        onImport();
        return;
      }
      if ((result as { importStatus?: string }).importStatus === "failed") {
        makeErrorToast(
          "Import failed",
          (result as { errorLog?: string | null }).errorLog ??
            "Failed to import data",
        );
        return;
      }
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
      loading={isImporting || isImportPolling}
      disabled={isImporting || isImportPolling}
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
  const uploadPendingFileRef = useRef<File | null>(null);
  const uploadPendingIdRef = useRef<string | null>(null);
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

  const {
    startPolling: startUploadPolling,
    stopPolling: stopUploadPolling,
    isPolling: isUploadPolling,
  } = usePollUntil<ImportStatusResponse>({
    fetch: useCallback(() => {
      const id = uploadPendingIdRef.current;
      if (!id || !cityId || !inventoryId)
        return Promise.reject(new Error("Upload poll: missing id or context"));
      return getImportStatus({ cityId, inventoryId, importedFileId: id }).unwrap() as Promise<ImportStatusResponse>;
    }, [cityId, inventoryId, getImportStatus]),
    isTerminal: (res) => {
      if (
        res.importStatus === "pending_ai_extraction" ||
        res.importStatus === "pending_ai_interpretation" ||
        res.importStatus === "waiting_for_approval"
      )
        return { done: true, success: true, data: res };
      if (res.importStatus === "failed") return { done: true, success: false, data: res };
      return { done: false };
    },
    onSuccess: (res) => {
      const file = uploadPendingFileRef.current;
      if (file) setUploadedFile(file);
      setImportedFileId(res.id);
      if (res.importStatus === "pending_ai_extraction") {
        setPdfPendingExtraction(true);
        setTabularPendingInterpretation(false);
      } else {
        setPdfPendingExtraction(false);
        setTabularPendingInterpretation(res.importStatus === "pending_ai_interpretation");
        if (res.importStatus === "waiting_for_approval") setTimeout(() => goToNextStep(), 150);
      }
    },
    onFailure: (res) =>
      makeErrorToast("Upload failed", resolveErrorMessage(res.errorLog, "File validation or processing failed", t)),
    onPollError: (err) =>
      logger.debug(
        { err, cityId, inventoryId, importedFileId: uploadPendingIdRef.current },
        "Upload status poll failed",
      ),
    intervalMs: 3000,
  });

  const {
    startPolling: startExtractionPolling,
    stopPolling: stopExtractionPolling,
    isPolling: isExtractionPolling,
  } = usePollUntil<ImportStatusResponse>({
    fetch: useCallback(
      () =>
        getImportStatus({ cityId, inventoryId, importedFileId: importedFileId! }).unwrap() as Promise<ImportStatusResponse>,
      [cityId, inventoryId, importedFileId, getImportStatus],
    ),
    isTerminal: (res) => {
      if (res.importStatus === "waiting_for_approval") return { done: true, success: true, data: res };
      if (res.importStatus === "failed") return { done: true, success: false, data: res };
      return { done: false };
    },
    onSuccess: () => {
      setIsExtractInProgress(false);
      setExtractionProgress(null);
      setPdfPendingExtraction(false);
      setTimeout(() => goToNextStep(), 150);
    },
    onFailure: (res) => {
      setIsExtractInProgress(false);
      setExtractionProgress(null);
      makeErrorToast(t("extraction-failed"), resolveErrorMessage(res.errorLog, t("ai-extraction-failed-default"), t));
    },
    onTick: (res) => {
      const progress = (res as ImportStatusResponse & { mappingConfiguration?: { extractionProgress?: { current: number; total?: number } } })
        ?.mappingConfiguration?.extractionProgress;
      const total = progress?.total;
      if (progress != null && total != null && total > 1)
        setExtractionProgress({ current: progress.current, total });
    },
    onPollError: (err) =>
      logger.debug({ err, cityId, inventoryId, importedFileId }, "Import status poll failed"),
    intervalMs: 3000,
  });

  const {
    startPolling: startInterpretPolling,
    stopPolling: stopInterpretPolling,
    isPolling: isInterpretPolling,
  } = usePollUntil<ImportStatusResponse>({
    fetch: useCallback(
      () =>
        getImportStatus({ cityId, inventoryId, importedFileId: importedFileId! }).unwrap() as Promise<ImportStatusResponse>,
      [cityId, inventoryId, importedFileId, getImportStatus],
    ),
    isTerminal: (res) => {
      if (res.importStatus === "waiting_for_approval") return { done: true, success: true, data: res };
      if (res.importStatus === "failed") return { done: true, success: false, data: res };
      return { done: false };
    },
    onSuccess: () => {
      setIsInterpretInProgress(false);
      setTabularPendingInterpretation(false);
      setTimeout(() => goToNextStep(), 150);
    },
    onFailure: (res) =>
      makeErrorToast(
        t("interpretation-failed") ?? "Interpretation failed",
        resolveErrorMessage(res.errorLog, t("ai-extraction-failed-default"), t),
      ),
    onPollError: (err) =>
      logger.debug({ err, cityId, inventoryId, importedFileId }, "Interpret status poll failed"),
    intervalMs: 3000,
  });

  const handleFileUpload = async (file: File) => {
    if (!inventoryId) {
      makeErrorToast("Error", "Inventory ID is required");
      return;
    }
    stopUploadPolling();
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

      if ("accepted" in result && result.accepted) {
        uploadPendingFileRef.current = file;
        uploadPendingIdRef.current = result.id;
        startUploadPolling();
        return;
      }

      setUploadedFile(file);
      setImportedFileId(result.id);
      setPdfPendingExtraction(
        (result as { importStatus?: string; fileType?: string }).importStatus === "pending_ai_extraction" ||
          (result as { fileType?: string }).fileType === "pdf",
      );
      setTabularPendingInterpretation(
        (result as { importStatus?: string }).importStatus === "pending_ai_interpretation",
      );
      if (
        (result as { importStatus?: string }).importStatus !== "pending_ai_extraction" &&
        (result as { importStatus?: string }).importStatus !== "pending_ai_interpretation"
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
    stopExtractionPolling();
    stopInterpretPolling();
    stopUploadPolling();
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
    stopExtractionPolling();
    setIsExtractInProgress(true);
    setExtractionProgress(null);
    startExtractionPolling();
    try {
      const result = await extractImport({
        cityId,
        inventoryId,
        importedFileId,
      }).unwrap();
      if ("accepted" in result && result.accepted) return;
      stopExtractionPolling();
      setIsExtractInProgress(false);
      setPdfPendingExtraction(false);
      await getImportStatus({
        cityId,
        inventoryId,
        importedFileId,
      }).unwrap();
      setTimeout(() => goToNextStep(), 150);
    } catch (error: any) {
      stopExtractionPolling();
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
    stopInterpretPolling();
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
        startInterpretPolling();
        return;
      }
      setIsInterpretInProgress(false);
      if ((result as { importStatus?: string }).importStatus === "failed") {
        const errorLog = (result as { errorLog?: string | null }).errorLog;
        makeErrorToast(
          t("interpretation-failed") ?? "Interpretation failed",
          resolveErrorMessage(errorLog, t("ai-extraction-failed-default"), t),
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
                      isUploading={isUploadingFile || isUploadPolling}
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
                    {pdfPendingExtraction || tabularPendingInterpretation
                      ? t("extract-with-ai")
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
