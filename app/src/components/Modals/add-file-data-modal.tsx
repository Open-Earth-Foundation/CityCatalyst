import React, { FC, useState } from "react";
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
import { SubSectorWithRelations } from "@/app/[lng]/data/[step]/types";
import { SubmitHandler, useForm } from "react-hook-form";
import { useDispatch, useSelector } from "react-redux";
import { addFileData, clear } from "@/features/city/fileDataSlice";
import { RootState } from "@/lib/store";

interface AddFileDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  subsectors: SubSectorWithRelations[] | null;
}

export interface FileData {
  subsectors: string;
  scope: string;
}

const AddFileDataModal: FC<AddFileDataModalProps> = ({
  isOpen,
  onClose,
  subsectors,
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

  const onSubmit: SubmitHandler<FileData> = (data) => {
    const scopeValues = selectedScopes.slice().join(",");
    dispatch(
      addFileData({
        subsectors: data.subsectors!,
        scopes: scopeValues!,
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
          Tell Us More About This File
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
              What type of data is contained in it?
            </Text>

            <Text
              textAlign="center"
              fontSize="body.lg"
              fontWeight="normal"
              lineHeight="24px"
              letterSpacing="wide"
            >
              Choose from the options below. This will help us to better
              identify and include this information in your inventory.
            </Text>
            <Divider borderColor="divider.grey03" borderWidth="2px" />
            <Box w="100%">
              <form className="w-full flex flex-col gap-[36px]">
                <FormControl>
                  <FormLabel display="flex" alignItems="center" gap="8px">
                    <Text>Select Sub-sectors</Text>
                    <InfoOutlineIcon color="interactive.control" />
                  </FormLabel>
                  <DropdownSelectInput
                    subsectors={subsectors}
                    setValue={setValue}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>
                    <Text>Scopes</Text>
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
                          {...register("scope")}
                          onChange={(e) =>
                            handleSelectedScopes(scope.value, e.target.checked)
                          }
                          checked={selectedScopes.includes(scope.value)}
                        />
                        <Text fontWeight="bold">Scope {scope.value}</Text>
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
            cancel
          </Button>
          <Button
            variant="ghost"
            color="white"
            bg="interactive.secondary"
            h="64px"
            w="316px"
            onClick={handleSubmit(onSubmit)}
          >
            upload
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default AddFileDataModal;
