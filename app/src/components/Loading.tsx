import {
  ProgressCircleRing,
  ProgressCircleRoot,
} from "@/components/ui/progress-circle";
import { Center } from "@chakra-ui/react";

export default function Loading() {
  return (
    <Center>
      <ProgressCircleRoot
        value={null}
        size="sm"
        color="interactive.secondary"
        mr="4px"
      >
        <ProgressCircleRing cap="round" css={{ "--thickness": "2px" }} />
      </ProgressCircleRoot>
    </Center>
  );
}
