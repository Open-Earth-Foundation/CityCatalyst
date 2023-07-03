import { NextUIProvider } from "@nextui-org/react";
import { FC } from "react";

interface RootProps{
    children: React.ReactNode[] | React.ReactNode[]
}
const Root:FC<RootProps> = ({
    children
}) => {
    return(
        <NextUIProvider>
            {children}
        </NextUIProvider>
    )
}