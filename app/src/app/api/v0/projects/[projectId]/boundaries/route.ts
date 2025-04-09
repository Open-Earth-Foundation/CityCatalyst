import { apiHandler } from "@/util/api";
import { Project } from "@/models/Project";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { db } from "@/models";
import CityBoundaryService from "@/backend/CityBoundaryService";

// TODO cache the results of this route
export const GET = apiHandler(async (req, { params, session }) => {
  const { projectId } = params;
  // TODO perform access control by checking if the user is part of the organization/ project
  const project = await Project.findByPk(projectId as string, {
    include: { model: db.models.City, as: "cities", attributes: ["locode"] },
  });
  if (!project) {
    throw new createHttpError.NotFound("project-not-found");
  }
  const cityLocodes = project.cities.map((city) => city.locode);

  const boundaries = await Promise.all(
    cityLocodes
      .filter((cityLocode) => !!cityLocode)
      .map((cityLocode) => CityBoundaryService.getCityBoundary(cityLocode!)),
  );

  return NextResponse.json(boundaries);
});
