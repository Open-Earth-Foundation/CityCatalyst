import { CheckIcon } from '@chakra-ui/icons'
import { Card, Heading, Text } from '@chakra-ui/react'
import React, { FC } from 'react';

interface SubSectorCardProps {
    title: string;
    scopes: string
}

const SubSectorCard:FC<SubSectorCardProps> = ({title, scopes}) => {
  return (
    <Card className='flex flex-row w-[333.1px] h-[100px] items-center px-4 gap-4 border border-[#E6E7FF] shadow-none'>
        <div>
            <div className='flex h-[32px] w-[32px] rounded-full text-[#24BE00] items-center justify-center border-2 border-[#24BE00]'>
                <CheckIcon />
            </div>
        </div>
        <div>
            <Heading className='font-[500] text-[14px]'>
                {title}
            </Heading>
            <Text className='font-[400] text-[#7A7B9A]'>
                Scope: {scopes}
            </Text>
        </div>
    </Card>
  )
}

export default SubSectorCard