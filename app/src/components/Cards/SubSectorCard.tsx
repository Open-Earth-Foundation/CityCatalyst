import { CheckIcon } from '@chakra-ui/icons'
import { Box, Card, Heading, Text } from '@chakra-ui/react'
import React, { FC } from 'react';

interface SubSectorCardProps {
    title: string;
    scopes: string
}

const SubSectorCard:FC<SubSectorCardProps> = ({title, scopes}) => {
  return (
    <Card className='flex flex-row w-[333.1px] h-[100px] items-center px-4 gap-4 border border-[#E6E7FF] shadow-none'>
        <Box>
            <Box className='flex h-[32px] w-[32px] rounded-full text-[#24BE00] items-center justify-center border-2 border-[#24BE00]'>
                <CheckIcon />
            </Box>
        </Box>
        <Box className='flex flex-col gap-[8px]'>
            <Heading fontSize="title.sm" fontWeight="medium" lineHeight="20" letterSpacing="wide" color="content.primary">
                {title}
            </Heading>
            <Text fontWeight="regular" color="interactive.control" lineHeight="20" letterSpacing="wide">
                Scope: {scopes}
            </Text>
        </Box>
    </Card>
  )
}

export default SubSectorCard;