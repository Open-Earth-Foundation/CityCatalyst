import { InputGroup } from "@/components/ui/input-group";
import { Icon, IconButton, Input } from "@chakra-ui/react";
import { LuSearch } from "react-icons/lu";
import { MdClose } from "react-icons/md";
import React from "react";

const SearchInput = ({
  searchTerm,
  setSearchTerm,
  className,
  placeholder,
}: {
  searchTerm: string;
  setSearchTerm: (searchTerm: string) => void;
  className?: string;
  placeholder?: string;
}) => {
  return (
    <InputGroup
      color=""
      w="full"
      rounded={32}
      backgroundColor="background.overlay"
      className={className}
      startElement={
        <Icon
          as={LuSearch}
          className="opacity-50"
          color={"#414249"}
          boxSize={4}
        />
      }
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
        onChange={(e) => setSearchTerm(e.target.value)}
        border="0px"
        paddingX={2}
        placeholder={placeholder}
        outline="none"
        value={searchTerm}
      />
    </InputGroup>
  );
};

export default SearchInput;
