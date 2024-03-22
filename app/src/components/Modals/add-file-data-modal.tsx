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
import { AddFileIcon } from "../icons";
import DropdownSelectInput from "../dropdown-select-input";
import { InfoIcon, InfoOutlineIcon } from "@chakra-ui/icons";
import {
  DataStep,
  SubSectorWithRelations,
} from "@/app/[lng]/data/[step]/types";
import { SubmitHandler, useForm } from "react-hook-form";
import { useDispatch, useSelector } from "react-redux";
import { addFileData, clear } from "@/features/city/fileDataSlice";
import { RootState } from "@/lib/store";
import { TFunction } from "i18next";
import { addFile } from "@/features/city/inventoryDataSlice";
import { v4 as uuidv4 } from "uuid";
import { UserInfoResponse } from "@/util/types";

interface AddFileDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  subsectors: SubSectorWithRelations[] | null;
  t: TFunction;
  uploadedFile: File;
  currentStep: DataStep;
  userInfo: UserInfoResponse | undefined;
}

export interface FileData {
  subsectors: string;
  scopes: string;
}

const AddFileDataModal: FC<AddFileDataModalProps> = ({
  isOpen,
  onClose,
  subsectors,
  t,
  uploadedFile,
  currentStep,
  userInfo,
}) => {
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
    formState: { errors },
  } = useForm<FileData>();

  console.log(uploadedFile);

  function fileToBase64(file: File) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);

      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  }

  const onSubmit: SubmitHandler<FileData> = async (data) => {
    const scopeValues = selectedScopes.slice().join(",");
    const base64FileString = await fileToBase64(uploadedFile);
    const filename = uploadedFile.name;

    dispatch(
      addFile({
        sectorName: currentStep.title!,
        fileData: {
          fileId: uuidv4(),
          fileName: filename,
          subsectors: data.subsectors,
          scopes: data.scopes,
          userId: userInfo?.userId,
          sector: currentStep.title,
          data: base64FileString,
          // TODO this should not be passed in but rather set on the server (only necessary for AWS S3 or external hosting)
          url: "http://localhost",
          size: uploadedFile.size,
          fileType: filename.split(".").pop(),
        },
      }),
    );
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
            >
              <AddFileIcon />
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
            <Divider borderColor="divider.grey03" borderWidth="2px" />
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
                  />
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
                          {...register("scopes")}
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
                </FormControl>
              </form>
            </Box>
          </Box>
        </ModalBody>
        <ModalFooter
          borderTopWidth="2px"
          color="divider.grey03"
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
