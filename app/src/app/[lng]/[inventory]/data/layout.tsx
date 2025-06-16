"use client";;
import { use } from "react";

import { Box } from "@chakra-ui/react";
import { Toaster } from "@/components/ui/toaster";

export default function DataLayout(
  props: {
    children: React.ReactNode;
    params: Promise<{ lng: string }>;
  }
) {
  const params = use(props.params);

  const {
    lng
  } = params;

  const {
    children
  } = props;

  return (
    <Box className="h-full flex flex-col" bg="background.backgroundLight">
      <Toaster />
      <div className="w-full h-full">{children}</div>
    </Box>
  );
}
