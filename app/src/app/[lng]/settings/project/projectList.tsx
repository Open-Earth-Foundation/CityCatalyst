import { ProjectWithCities } from "@/util/types";
import React, { useState } from "react";
import { Accordion, Box, Icon, Tabs, Text } from "@chakra-ui/react";
import {
  AccordionItem,
  AccordionItemContent,
  AccordionItemTrigger,
  AccordionRoot,
} from "@/components/ui/accordion";
import { LuChevronDown } from "react-icons/lu";
import { TFunction } from "i18next";
import ProjectSearchInput from "../ProjectSearchInput";

interface ProjectListProps {
  t: TFunction;
  projects: ProjectWithCities[];
  setSelectedProject: (value: string[]) => void;
  expandedProjectId: string[];
  setExpandedProjectId: (value: string[]) => void;
  selectedCity: string | null;
  setSelectedCity: (value: string | null) => void;
}

const ProjectList: React.FC<ProjectListProps> = ({
  t,
  projects,
  setSelectedProject,
  expandedProjectId,
  setExpandedProjectId,
  setSelectedCity,
  selectedCity,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filteredProjects, setFilteredProjects] =
    useState<ProjectWithCities[]>(projects);

  const handleSearch = (value: string) => {
    setSearchTerm(value.trim());

    if (!value.trim()) {
      setFilteredProjects(projects);
      return;
    }

    const result = projects.filter((project) => {
      return project.name.toLowerCase().includes(value.toLowerCase());
    });

    setFilteredProjects(result);
  };

  return (
    <Box minW="270px" flex={1} display="flex" flexDirection="column" gap="6">
      <Text
        display="flex"
        alignItems="center"
        h="48px"
        fontSize="title.md"
        fontWeight="semibold"
        color="content.secondary"
      >
        {t("projects")}
      </Text>
      <ProjectSearchInput value={searchTerm} onChange={handleSearch} t={t} />
      <Box
        p={3}
        borderRadius="8px"
        borderWidth="1px"
        borderColor="border.overlay"
        flex="1"
        minH="0"
        overflowY="scroll"
      >
        <AccordionRoot
          variant="plain"
          collapsible
          value={expandedProjectId}
          onValueChange={(val) => {
            setExpandedProjectId(val.value);
          }}
        >
          {filteredProjects.map((project) => (
            <AccordionItem key={project.projectId} value={project.projectId}>
              <AccordionItemTrigger
                onClick={() => {
                  setSelectedProject([project.projectId]);
                  setSelectedCity(null);
                }}
                w="full"
                hideIndicator
                padding="0px"
              >
                <Box
                  display="flex"
                  justifyContent="space-between"
                  w="full"
                  minH="56px"
                  pl={4}
                  alignItems="center"
                  color={
                    expandedProjectId.includes(project.projectId)
                      ? "interactive.secondary"
                      : "content.secondary"
                  }
                >
                  <Text
                    fontSize="label.lg"
                    fontWeight="semibold"
                    color="currentcolor"
                    textTransform="none"
                  >
                    {project.name}
                  </Text>
                  <Accordion.ItemIndicator
                    color="currentColor"
                    rotate={{ base: "0deg", _open: "-180deg" }}
                  >
                    <Icon as={LuChevronDown} color="currentColor" boxSize={6} />
                  </Accordion.ItemIndicator>
                </Box>
              </AccordionItemTrigger>
              {expandedProjectId.includes(project.projectId) && (
                <AccordionItemContent padding="0px" pb={4}>
                  {project.cities.length === 0 ? (
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
                        {project.cities.map((city) => (
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
                            {city.countryLocode ? ", " : ""}
                            {city.countryLocode}
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
    </Box>
  );
};

export default ProjectList;
