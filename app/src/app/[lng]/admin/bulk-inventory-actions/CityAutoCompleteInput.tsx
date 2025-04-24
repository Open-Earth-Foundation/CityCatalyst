"use client";
import React, { useState, useRef } from "react";
import {
  Box,
  Input,
  Tag,
  TagLabel,
  ListItem,
  Spinner,
  List,
  Text,
} from "@chakra-ui/react";
import { useGetOCCityQuery } from "@/services/api";
import { useOutsideClick } from "@/lib/use-outside-click";

type GeoPath = {
  actor_id: string;
  name: string;
  type: string;
};

export interface City {
  name: string;
  actor_id: string;
  root_path_geo: GeoPath[];
}

interface CityAutocompleteInputProps {
  initialValues?: City[];
  onChange: (cities: City[]) => void;
  t: (key: string) => string;
  error?: { message?: string };
}

const CityAutocompleteInput: React.FC<CityAutocompleteInputProps> = ({
  initialValues = [],
  onChange,
  t,
  error,
}) => {
  const [inputValue, setInputValue] = useState("");
  const [selectedCities, setSelectedCities] = useState<City[]>(initialValues);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Hide dropdown when clicking outside
  //   useOutsideClick(containerRef, () => setShowDropdown(false));

  // Trigger city search if input length > 2
  const { data: citiesData, isLoading: isCityLoading } = useGetOCCityQuery(
    inputValue,
    {
      skip: inputValue.length <= 2,
    },
  );

  const handleSelectCity = (city: City) => {
    // Prevent duplicate entries
    if (!selectedCities.some((c) => c.actor_id === city.actor_id)) {
      const newSelected = [...selectedCities, city];
      setSelectedCities(newSelected);
      onChange(newSelected);
    }
    setInputValue("");
    setShowDropdown(false);
  };

  const handleRemoveCity = (locode: string) => {
    const newSelected = selectedCities.filter(
      (city) => city.actor_id !== locode,
    );
    setSelectedCities(newSelected);
    onChange(newSelected);
  };

  const renderParentPath = (path: GeoPath[]) => {
    let pathString = "";
    const pathCopy = [...path];

    pathCopy
      ?.reverse()
      .slice(1)
      .map((parent: any) => {
        if (pathString) {
          pathString = pathString + " > ";
        }
        pathString = pathString + parent.name;
      });

    return pathString;
  };

  return (
    <Box position="relative" ref={containerRef}>
      <Text fontFamily="heading" fontWeight="medium" fontSize="body.md">
        {t("cities")}
      </Text>
      <Input
        h="56px"
        boxShadow="1dp"
        placeholder={t("search-city-placeholder")}
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          setShowDropdown(true);
        }}
        onFocus={() => setShowDropdown(true)}
      />
      {showDropdown && inputValue.length > 2 && (
        <Box
          position="absolute"
          width="100%"
          bg="white"
          zIndex={10}
          border="1px solid #ccc"
          borderRadius="md"
          mt="2"
          maxH="200px"
          overflowY="auto"
        >
          {isCityLoading ? (
            <Box textAlign="center" py="2">
              <Spinner size="sm" />
            </Box>
          ) : (
            <>
              {citiesData && citiesData.length > 0 ? (
                <List.Root>
                  {citiesData.map((city: City, index: number) => (
                    <List.Item
                      key={index}
                      cursor="pointer"
                      p="2"
                      _hover={{
                        bg: "interactive.secondary",
                        color: "base.light",
                      }}
                      onClick={() => handleSelectCity(city)}
                    >
                      <Text>
                        {city.name} ({city.actor_id})
                      </Text>
                      <Text fontSize="body.md">
                        {renderParentPath(city.root_path_geo)}
                      </Text>
                    </List.Item>
                  ))}
                </List.Root>
              ) : (
                <Box textAlign="center" py="2">
                  {t("no-cities-found") || "No cities found"}
                </Box>
              )}
            </>
          )}
        </Box>
      )}
      <Box mt="2" display="flex" flexWrap="wrap" gap="2">
        {selectedCities.map((city, index) => (
          <Tag.Root
            key={index}
            size="md"
            borderRadius="16px"
            p="6px"
            px="20px"
            variant="solid"
            bg="background.neutral"
            color="content.alternative"
            display="flex"
            justifyContent="center"
          >
            <Tag.Label fontWeight="400">{city.actor_id}</Tag.Label>
            <Tag.EndElement color="interactive.control">
              <Tag.CloseTrigger
                onClick={() => handleRemoveCity(city.actor_id)}
                boxSize={6}
                mt="-6px"
              />
            </Tag.EndElement>
          </Tag.Root>
        ))}
      </Box>
      {error && (
        <Box color="red.500" mt="2">
          {error.message}
        </Box>
      )}
    </Box>
  );
};

export default CityAutocompleteInput;
