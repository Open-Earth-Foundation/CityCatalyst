import { Box } from "@chakra-ui/react";
import { FC, ReactNode } from "react";

interface WrapperProps {
  children: ReactNode[] | ReactNode;
}

const Wrapper: FC<WrapperProps> = ({ children }) => {
  return (
    <Box pt={16} pb={16} w="1090px" maxW="full" mx="auto" px={4}>
      {children}
    </Box>
  );
};

export default Wrapper;
