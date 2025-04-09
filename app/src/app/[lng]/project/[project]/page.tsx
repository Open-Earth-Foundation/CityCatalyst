"use client";

import { api } from "@/services/api";
import ProjectMap from "./ProjectMap";

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

  return (
    <>
      <ProjectMap height={800} width={800} projectId={project} />
      {JSON.stringify(projectSummary)}
    </>
  );
}
