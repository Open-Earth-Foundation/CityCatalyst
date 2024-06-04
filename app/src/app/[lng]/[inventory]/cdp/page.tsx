import { NavigationBar } from '@/components/navigation-bar';
import { Box, Button, Card, CardBody, CardFooter, CardHeader, Text } from '@chakra-ui/react';
import React from 'react'

const Page = () => {
    return (
        <Box>
            <NavigationBar lng='' />
            <Box className='h-[100vh] w-full flex justify-center items-center'>
                <Card className='h-[300px] w-[300px] flex '>
                    <CardHeader fontFamily='heading' fontWeight='bold' fontSize='headline.lg' className='flex items-center justify-center'><Text>Add Data</Text></CardHeader>
                    <CardBody className='flex items-center justify-center'><Text>Sumbit data into CDP</Text></CardBody>
                    <CardFooter p='0'><Button className='w-[100%]' h='50px'>submit data into cdp</Button></CardFooter>
                </Card>
            </Box>
        </Box>
    )
}

export default Page;