import { ProjectWithCities } from "@/util/types";
import React, { useState } from "react";
import { Accordion, Box, Button, Icon, Tabs, Text } from "@chakra-ui/react";
import {
  AccordionItem,
  AccordionItemContent,
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
    <Box
      w="285px"
      flexShrink={0}
      overflowY="hidden"
      display="flex"
      flexDirection="column"
      gap="24px"
    >
      <Text fontSize="title.md" fontWeight="semibold" color="content.secondary">
        {t("projects")}
      </Text>
      <ProjectSearchInput value={searchTerm} onChange={handleSearch} t={t} />
      <AccordionRoot
        variant="plain"
        collapsible
        value={expandedProjectId}
        onValueChange={(val) => {
          setExpandedProjectId(val.value);
        }}
        borderWidth="1px"
        borderColor="border.overlay"
        borderRadius="8px"
        p="3"
        w="full"
        flex="1"
        minH="0"
        overflowY="scroll"
      >
        {filteredProjects.length === 0 && (
          <Text
            fontSize="body.md"
            fontWeight="medium"
            color="content.tertiary"
            p={4}
          >
            {t("no-data")}
          </Text>
        )}
        {filteredProjects.map((project) => (
          <AccordionItem key={project.projectId} value={project.projectId}>
            <Accordion.ItemTrigger
              onClick={() => {
                setSelectedProject([project.projectId]);
                setSelectedCity(null);
              }}
              w="full"
              padding="0px"
              asChild
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
                  expandedProjectId.includes(project.projectId)
                    ? "interactive.secondary"
                    : "content.secondary"
                }
              >
                <Text
                  fontSize="label.lg"
                  fontWeight="semibold"
                  color="currentcolor"
                >
                  {project.name}
                </Text>
                <Accordion.ItemIndicator
                  color="currentColor"
                  rotate={{ base: "0deg", _open: "-180deg" }}
                  mr="24px"
                >
                  <Icon as={LuChevronDown} color="currentColor" boxSize={4} />
                </Accordion.ItemIndicator>
              </Button>
            </Accordion.ItemTrigger>
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
                          fontFamily="body"
                          justifyContent={"left"}
                          letterSpacing={"wide"}
                          color="content.secondary"
                          lineHeight="20px"
                          fontStyle="normal"
                          fontSize="body.md"
                          fontWeight="medium"
                          minH="52px"
                          w="full"
                          pl="6"
                          _selected={{
                            color: "content.link",
                            fontSize: "body.md",
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
  );
};

export default ProjectList;
