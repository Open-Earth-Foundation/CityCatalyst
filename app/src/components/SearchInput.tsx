import { InputGroup } from "@/components/ui/input-group";
import { Icon, IconButton, Input } from "@chakra-ui/react";
import { LuSearch } from "react-icons/lu";
import { MdClose, MdSearch } from "react-icons/md";
import React from "react";

const SearchInput = ({
  searchTerm,
  setSearchTerm,
  placeholder,
}: {
  searchTerm: string;
  setSearchTerm: (searchTerm: string) => void;
  placeholder?: string;
}) => {
  return (
    <InputGroup
      startElement={
        <Icon as={MdSearch} color="interactive.control" boxSize={6} />
      }
      width="100%"
      border="1px"
      borderStyle="solid"
      borderColor="border.neutral"
      endElement={
        searchTerm ? (
          <IconButton
            onClick={() => setSearchTerm("")}
            aria-label="search"
            colorScheme="interactive.secondary"
            variant="ghost"
          >
            <Icon
              as={MdClose}
              className="opacity-50"
              boxSize={4}
              color={"colors.interactive.control"}
            />
          </IconButton>
        ) : null
      }
    >
      <Input
        minWidth="350px"
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder={placeholder}
        value={searchTerm}
      />
    </InputGroup>
  );
};

export default SearchInput;
