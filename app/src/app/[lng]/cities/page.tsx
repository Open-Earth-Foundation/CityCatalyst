"use client";

import React, { use } from "react";
import HomePage from "@/components/HomePageJN/HomePage";

const CitiesPage = (props: { params: Promise<{ lng: string }> }) => {
  const { lng } = use(props.params);

  return <HomePage lng={lng} isPublic={false} />;
};

export default CitiesPage;
