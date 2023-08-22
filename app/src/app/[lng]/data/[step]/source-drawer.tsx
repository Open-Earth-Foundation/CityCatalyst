import {
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  Icon,
} from "@chakra-ui/react";
import { RefObject } from "react";

export function SourceDrawer({
  source,
  isOpen,
  onClose,
  onConnectClick,
  finalFocusRef,
}: {
  source?: DataSource;
  isOpen: boolean;
  onClose: () => void;
  onConnectClick: () => void;
  finalFocusRef?: RefObject<any>;
}) {
  return (
    <Drawer
      isOpen={isOpen}
      placement="right"
      onClose={onClose}
      finalFocusRef={finalFocusRef}
    >
      <DrawerOverlay />
      <DrawerContent>
        <DrawerCloseButton />
        {source && <DrawerBody className="space-y-6">
          <Icon as={source.icon} boxSize={9} />
          <DrawerHeader>{source.title}</DrawerHeader>
        </DrawerBody>}

        <DrawerFooter>
          <Button onClick={onConnectClick} />
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
