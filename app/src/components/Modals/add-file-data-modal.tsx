import React, { FC } from "react";
import {
  Box,
  Button,
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

interface AddFileDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  subsectors: SubSectorWithRelations[] | null;
}

const AddFileDataModal: FC<AddFileDataModalProps> = ({
  isOpen,
  onClose,
  subsectors,
}) => {
  return (
    <Modal blockScrollOnMount={false} isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />
      <ModalContent minH="300px" minW="568px" marginTop="10%">
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
              <form className="w-full">
                <FormControl>
                  <FormLabel display="flex" alignItems="center" gap="8px">
                    <Text>Select Sub-sectors</Text>
                    <InfoOutlineIcon color="interactive.control" />
                  </FormLabel>
                  <DropdownSelectInput subsectors={subsectors} />
                </FormControl>
              </form>
            </Box>
          </Box>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default AddFileDataModal;
