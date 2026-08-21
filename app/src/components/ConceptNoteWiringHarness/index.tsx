"use client";

import { Box } from "@chakra-ui/react";
import { motion, useReducedMotion } from "framer-motion";

import { ConceptNoteHomeScreen } from "./concept-note-home-screen";
import { ConceptNoteScopeScreen } from "./concept-note-scope-screen";
import { useConceptNoteWiring } from "./use-concept-note-wiring";

interface ConceptNoteWiringHarnessProps {
  cityId: string;
  initialRunId?: string;
  lng: string;
}

export function ConceptNoteWiringHarness({
  cityId,
  initialRunId,
  lng,
}: ConceptNoteWiringHarnessProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const controller = useConceptNoteWiring({ cityId, initialRunId, lng });

  return (
    <Box
      as="main"
      minH="calc(100vh - 74px)"
      bg="background.alternativeLight"
      px={{ base: 4, md: 10 }}
      py={{ base: 6, md: 10 }}
    >
      <motion.div
        key={controller.screen}
        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
      >
        {controller.screen === "home" ? (
          <ConceptNoteHomeScreen
            controller={controller}
            lng={lng}
            reducedMotion={reducedMotion}
          />
        ) : (
          <ConceptNoteScopeScreen
            controller={controller}
            lng={lng}
            reducedMotion={reducedMotion}
          />
        )}
      </motion.div>
    </Box>
  );
}
