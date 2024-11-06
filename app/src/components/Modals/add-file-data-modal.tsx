import React, { FC, useEffect, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Divider,
  FormControl,
  FormLabel,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  useToast,
} from "@chakra-ui/react";
import DropdownSelectInput from "../dropdown-select-input";
import { InfoIcon, InfoOutlineIcon } from "@chakra-ui/icons";
import {
  DataStep,
  SubSectorWithRelations,
} from "@/app/[lng]/[inventory]/data/[step]/types";
import { SubmitHandler, useForm } from "react-hook-form";
import { useDispatch } from "react-redux";
import { TFunction } from "i18next";
import { addFile } from "@/features/city/inventoryDataSlice";
import { v4 as uuidv4 } from "uuid";
import {
  InventoryResponse,
  UserFileResponse,
  UserInfoResponse,
} from "@/util/types";
import { MdOutlineInsertDriveFile } from "react-icons/md";
import { appendFileToFormData } from "@/util/helpers";
import { api, useAddUserFileMutation } from "@/services/api";

interface AddFileDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  subsectors: SubSectorWithRelations[] | null;
  t: TFunction;
  uploadedFile: File;
  currentStep: DataStep;
  userInfo: UserInfoResponse | undefined;
  inventory: string;
}

export interface FileData {
  subsectors: string;
  scopes: string;
}

const scopes = [
  {
    value: 1,
  },
  {
    value: 2,
  },
  {
    value: 3,
  },
];

const AddFileDataModal: FC<AddFileDataModalProps> = ({
  isOpen,
  onClose,
  subsectors,
  t,
  uploadedFile,
  currentStep,
  userInfo,
  inventory,
}) => {
  const [selectedScopes, setSelectedScopes] = useState<number[]>([]);

  const handleSelectedScopes = (value: number, checked: boolean) => {
    if (checked) {
      setSelectedScopes([...selectedScopes, value]);
    } else {
      setSelectedScopes(selectedScopes.filter((scope) => scope !== value));
    }
  };
  const dispatch = useDispatch();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<FileData>();

  function fileToBase64(file: File) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);

      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  }

  const { data: inventoryData } = api.useGetInventoryQuery(inventory!, {
    skip: !userInfo,
  });

  const [addUserFile, { isLoading }] = api.useAddUserFileMutation();
  const DEFAULT_STATUS = "pending";
  const formData = new FormData();

  const cityId = inventoryData?.city.cityId!;

  const toast = useToast();

  const onSubmit: SubmitHandler<FileData> = async (data) => {
    const base64FileString = await fileToBase64(uploadedFile);
    const filename = uploadedFile.name;
    const file = appendFileToFormData(
      base64FileString as string,
      `${filename}`,
    );

    formData.append("userId", userInfo?.userId!);
    formData.append("fileName", filename);
    formData.append("inventoryId", inventory!);
    formData.append("sector", currentStep.name);
    formData.append("subsectors", data.subsectors!);
    formData.append("scopes", data.scopes!);
    formData.append("status", DEFAULT_STATUS);
    formData.append("fileReference", "");
    formData.append("url", "http://localhost");
    formData.append("gpcRefNo", "");
    formData.append("data", file, file.name);

    await addUserFile({ formData, cityId }).then((res: any) => {
      // show toast
      if (res.error) {
        toast({
          title: t("file-upload-error"),
          description: t("file-upload-error-description"),
          status: "error",
          duration: 2000,
        });
      } else {
        toast({
          title: t("file-upload-success"),
          description: t("file-upload-success"),
          status: "success",
          duration: 2000,
        });

        const fileData = res.data;

        dispatch(
          addFile({
            sectorName: fileData.sector,
            fileData: {
              fileId: fileData.id,
              fileName: fileData.fileName,
              subsectors: fileData.subsectors.join(","),
              scopes: fileData.scopes,
              userId: fileData.userId,
              sector: fileData.sector,
              data: base64FileString,
              // TODO this should not be passed in but rather set on the server (only necessary for AWS S3 or external hosting)
              url: fileData.url,
              size: fileData.file.size,
              fileType: fileData.fileType,
              cityId: fileData.cityId,
            },
          }),
        );
      }
    });

    onClose();
  };

  return (
    <Modal blockScrollOnMount={false} isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />
      <ModalContent minH="300px" minW="739px" marginTop="10%">
        <ModalHeader
          display="flex"
          justifyContent="center"
          fontWeight="semibold"
          fontSize="headline.sm"
          fontFamily="heading"
          lineHeight="32"
          padding="24px"
          borderBottomWidth="1px"
          borderStyle="solid"
          borderColor="border.neutral"
        >
          {t("file-context")}
        </ModalHeader>
        <ModalCloseButton marginTop="10px" />
        <ModalBody p={6} px={12}>
          <Box
            display="flex"
            flexDirection="column"
            w="full"
            alignItems="center"
            gap="24px"
          >
            <Box
              h="68px"
              w="68px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              bg="background.neutral"
              borderRadius="50px"
              marginBottom="24px"
              color="interactive.secondary"
            >
              <MdOutlineInsertDriveFile size={32} />
            </Box>
            <Text
              fontFamily="heading"
              fontSize="title.lg"
              color="interactive.secondary"
              fontWeight="bold"
            >
              {t("file-data-subtitle")}
            </Text>

            <Text
              textAlign="center"
              fontSize="body.lg"
              fontWeight="normal"
              lineHeight="24px"
              letterSpacing="wide"
            >
              {t("file-data-description")}
            </Text>
            <Divider borderColor="divider.neutral" borderWidth="2px" />
            <Box w="100%">
              <form className="w-full flex flex-col gap-[36px]">
                <FormControl>
                  <FormLabel display="flex" alignItems="center" gap="8px">
                    <Text>{t("select-subsector-label")}</Text>
                    <InfoOutlineIcon color="interactive.control" />
                  </FormLabel>
                  <DropdownSelectInput
                    subsectors={subsectors}
                    setValue={setValue}
                    watch={watch}
                    t={t}
                    register={register}
                  />
                  <Box>
                    {errors.subsectors && (
                      <Text color="sentiment.negativeDefault">
                        A scope required for each sub-sector
                      </Text>
                    )}
                  </Box>
                </FormControl>
                <FormControl>
                  <FormLabel>
                    <Text>{t("scopes")}</Text>
                  </FormLabel>
                  <Box display="flex" gap="16px">
                    {scopes.map((scope) => (
                      <Box
                        key={scope.value}
                        display="flex"
                        alignItems="baseline"
                        gap="8px"
                      >
                        <Checkbox
                          value={scope.value}
                          borderColor="interactive.secondary"
                          {...register("scopes", { required: true })}
                          onChange={(e) =>
                            handleSelectedScopes(scope.value, e.target.checked)
                          }
                          checked={selectedScopes.includes(scope.value)}
                        />
                        <Text fontWeight="bold">
                          {t("scope")} {scope.value}
                        </Text>
                      </Box>
                    ))}
                  </Box>
                  <Box>
                    {errors.scopes && (
                      <Text color="sentiment.negativeDefault">
                        A scope required for each sub-sector
                      </Text>
                    )}
                  </Box>
                </FormControl>
              </form>
            </Box>
          </Box>
        </ModalBody>
        <ModalFooter
          borderTopWidth="2px"
          color="divider.neutral"
          gap="10px"
          px="48px"
          justifyContent="space-around"
        >
          <Button
            variant="ghost"
            borderWidth="2px"
            borderColor="interactive.secondary"
            h="64px"
            w="316px"
            onClick={onClose}
          >
            {t("cancel")}
          </Button>
          <Button
            variant="ghost"
            color="white"
            bg="interactive.secondary"
            h="64px"
            w="316px"
            isLoading={isLoading}
            onClick={handleSubmit(onSubmit)}
          >
            {t("upload")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default AddFileDataModal;
