import React, { useEffect, useState } from "react";
import { Box, Text, Icon, Fieldset, CheckboxGroup } from "@chakra-ui/react";
import { MdArrowDropDown, MdArrowDropUp, MdClose } from "react-icons/md";
import { SubSectorWithRelations } from "@/app/[lng]/[inventory]/data/[step]/types";
import {
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
} from "react-hook-form";
import { FileData } from "./Modals/add-file-data-dialog";
import { TFunction } from "i18next";
import { Tag } from "./ui/tag";
import { Checkbox } from "./ui/checkbox";

interface DropdownSelectProps {
  subsectors: SubSectorWithRelations[] | null;
  setValue: UseFormSetValue<FileData>;
  t: TFunction;
  watch: UseFormWatch<FileData>;
  register: UseFormRegister<FileData>;
}

const DropdownSelectInput: React.FC<DropdownSelectProps> = ({
  subsectors,
  setValue,
  t,
  watch,
  register,
}) => {
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);

  const handleShowdropDown = () => {
    setShowDropdown((prev) => !prev);
  };

  useEffect(() => {
    setValue("subsectors", selectedItems.join(","));
  }, [selectedItems, setValue]);

  const handleRemoveItem = (item: string) => {
    setSelectedItems((prev) => prev.filter((selected) => selected !== item));
  };

  return (
    <Box className="w-full">
      <Box
        borderWidth="1px"
        borderColor={showDropdown ? "interactive.secondary" : "border.neutral"}
        borderRadius="4px"
        w="full"
        minH="48px"
        display="flex"
        alignItems="center"
        px="16px"
        onClick={handleShowdropDown}
        py={selectedItems.length > 2 ? "12px" : "0px"}
      >
        <Box w="full">
          {selectedItems.length ? (
            ""
          ) : (
            <Text
              w="full"
              pos="relative"
              lineHeight="24px"
              fontWeight="400"
              color="content.tertiary"
              letterSpacing="wide"
            >
              {t("select-placeholder")}
            </Text>
          )}
          {selectedItems.map((item, i) => (
            <Tag
              key={i}
              mt={2}
              mr={2}
              p={2}
              size="md"
              variant="solid"
              color="content.alternative"
              bg="background.neutral"
              maxW="200px"
              display="flex"
              flexDirection="row"
              justifyContent="space-between"
              alignContent="space-between"
            >
              <Text as="span">{t(item)}</Text>{" "}
              <Icon
                as={MdClose}
                onClick={() => handleRemoveItem(item)}
                color="content.alternative"
                boxSize="16px"
              />
            </Tag>
          ))}
          <Box w="full"></Box>
        </Box>
        <Box h="24px" w="24px">
          {!showDropdown ? (
            <MdArrowDropDown size="24px" />
          ) : (
            <MdArrowDropUp size="24px" />
          )}
        </Box>
      </Box>
      {showDropdown && (
        <Box
          w="full"
          h="300px"
          pos="absolute"
          bg="white"
          overflow="scroll"
          borderRadius="8px"
          shadow="2dp"
          py="16px"
          zIndex="50"
        >
          <Box w="full">
            <Fieldset.Root>
              <CheckboxGroup>
                <Fieldset.Content>
                  {subsectors?.map((subsector) => {
                    const subsectorName = subsector.subsectorName || "";

                    return (
                      <Box
                        key={subsector.subsectorId}
                        p="16px"
                        w="full"
                        onClick={(e) => {
                          // Directly toggle the item in state
                          setSelectedItems((prev) => {
                            if (prev.includes(subsectorName)) {
                              return prev.filter(
                                (item) => item !== subsectorName,
                              );
                            } else {
                              return [...prev, subsectorName];
                            }
                          });
                        }}
                      >
                        <Checkbox
                          _hover={{ bg: "content.link", color: "base.light" }}
                          p="16px"
                          w="full"
                          cursor="pointer"
                          key={subsector.subsectorId}
                          id={subsector.subsectorId}
                          checked={selectedItems.includes(subsectorName)}
                        >
                          <Text h="full" w="full" fontWeight="200">
                            {t(subsectorName)}
                          </Text>
                        </Checkbox>
                      </Box>
                    );
                  })}
                </Fieldset.Content>
              </CheckboxGroup>
            </Fieldset.Root>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default DropdownSelectInput;
