import { ProjectWithCities } from "@/util/types";
import React, { useState } from "react";
import { Accordion, Box, Button, Icon, Tabs, Text } from "@chakra-ui/react";
import {
  AccordionItem,
  AccordionItemContent,
  AccordionItemTrigger,
  AccordionRoot,
} from "@/components/ui/accordion";
import { LuChevronDown } from "react-icons/lu";
import { TFunction } from "i18next";

interface ProjectListProps {
  t: TFunction;
  projects: ProjectWithCities[];
  selectedProjectId: string[];
  setSelectedProject: (value: string[]) => void;
  selectedCity: string | null;
  setSelectedCity: (value: string | null) => void;
}

const ProjectList: React.FC<ProjectListProps> = ({
  t,
  projects,
  selectedProjectId,
  setSelectedProject,
  setSelectedCity,
  selectedCity,
}) => {
  return (
    <Box w="250px" flex={1}>
      <Text
        fontSize="title.md"
        mb={3}
        fontWeight="semibold"
        color="content.secondary"
      >
        {t("projects")}
      </Text>
      <AccordionRoot
        variant="plain"
        value={selectedProjectId}
        onValueChange={(val) => {
          setSelectedProject(val.value);
          setSelectedCity(null);
        }}
      >
        {projects.map((item) => (
          <AccordionItem key={item.projectId} value={item.projectId}>
            <AccordionItemTrigger
              onClick={() => {
                setSelectedCity(null);
              }}
              w="full"
              hideIndicator
              padding="0px"
            >
              <Button
                rounded={0}
                variant="plain"
                display="flex"
                justifyContent="space-between"
                w="full"
                minH="56px"
                p={4}
                pr={0}
                alignItems="center"
                color={
                  selectedProjectId.includes(item.projectId)
                    ? "interactive.secondary"
                    : "content.secondary"
                }
              >
                <Text
                  fontSize="label.lg"
                  fontWeight="semibold"
                  color="currentcolor"
                >
                  {item.name}
                </Text>
                <Accordion.ItemIndicator
                  color="currentColor"
                  rotate={{ base: "-90deg", _open: "-180deg" }}
                >
                  <Icon as={LuChevronDown} color="currentColor" boxSize={4} />
                </Accordion.ItemIndicator>
              </Button>
            </AccordionItemTrigger>
            {selectedProjectId[0] === item.projectId && (
              <AccordionItemContent padding="0px" pb={4}>
                {item.cities.length === 0 ? (
                  <Text
                    fontSize="body.lg"
                    fontWeight={600}
                    color="content.primary"
                  >
                    {t("no-cities")}
                  </Text>
                ) : (
                  <Tabs.Root
                    display="flex"
                    mt="12px"
                    flexDirection="row"
                    variant="subtle"
                    w="full"
                    gap="12px"
                    value={selectedCity}
                    onValueChange={(val) => setSelectedCity(val.value)}
                  >
                    <Tabs.List
                      w="full"
                      display="flex"
                      flexDirection="column"
                      gap="12px"
                    >
                      {item.cities.map((city) => (
                        <Tabs.Trigger
                          key={city.cityId}
                          value={city.cityId}
                          fontFamily="heading"
                          justifyContent={"left"}
                          letterSpacing={"wide"}
                          color="content.secondary"
                          lineHeight="20px"
                          fontStyle="normal"
                          fontSize="label.lg"
                          minH="52px"
                          w="full"
                          _selected={{
                            color: "content.link",
                            fontSize: "label.lg",
                            fontWeight: "medium",
                            backgroundColor: "background.neutral",
                            borderRadius: "8px",
                            borderWidth: "1px",
                            borderStyle: "solid",
                            borderColor: "content.link",
                          }}
                        >
                          {city.name}
                        </Tabs.Trigger>
                      ))}
                    </Tabs.List>
                  </Tabs.Root>
                )}
              </AccordionItemContent>
            )}
          </AccordionItem>
        ))}
      </AccordionRoot>
    </Box>
  );
};

export default ProjectList;
