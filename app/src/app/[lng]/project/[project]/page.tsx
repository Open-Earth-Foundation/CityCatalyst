"use client";

import { api } from "@/services/api";
import ProjectMap from "./ProjectMap";
import { useState } from "react";

export default function ProjectPage({
  params: { project, lng },
}: {
  params: { project: string; lng: string };
}) {
  const {
    data: projectSummary,
    isLoading,
    error,
  } = api.useGetProjectSummaryQuery(project!, {
    skip: !project,
  });
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);

  return (
    <>
      <ProjectMap
        height={800}
        width={800}
        projectId={project}
        setSelectedCityId={setSelectedCityId}
      />
      {JSON.stringify(projectSummary)}
      {selectedCityId}
    </>
  );
}
