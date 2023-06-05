import React, { FC, ReactNode } from 'react';

interface  ContainerProps {
    children: ReactNode
}

const Container:FC<ContainerProps> = ({
    children
}) => {
    return (
        <div
            className='
                flex
                items-center
                px-2
                w-full
                h-full
                md:px-4
                lg:px-64
            '
        >
            {children}
        </div>
    )
}

export default Container;