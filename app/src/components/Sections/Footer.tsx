import { Box, Button, Text } from '@chakra-ui/react'
import Image from 'next/image'
import { Link } from '@chakra-ui/react'
import React from 'react'

const Footer = () => {
  return (
    <footer className="w-full h-[320px] bg-[#00001f] pt-10">
        <Box className="w-full px-[64px]">
            <Box className='flex justify-between w-full pb-10'>
                <Box>
                    <Image src="/assets/city_catalyst_logo.svg" alt='city-catalyst-logo' width={121} height={24}/>
                </Box>
                <Box fontFamily="fonts.heading" className='text-white text-[14px] grid grid-cols-3 gap-6 font-poppins'>
                    <Link href="/">About Open Climate</Link>
                    <Link href="/">Contribution Guide</Link>
                    <Link href="/">Go to GitHub</Link>
                    <Link href="/">CAD2.0 Community</Link>
                    <Link href="/">Read the docs</Link>
                    <Link href="/">Python Client Docs</Link>
                </Box>
                <Box>
                    <Button className='bg-[#2351DC] text-white h-[48px] w-[150px] gap-3 rounded-full' variant='ghost' colorScheme='blue'>
                        <span>CONTACT US</span>
                    </Button>
                </Box>
            </Box>
            <Box className='h-[1px] bg-[#232640]'/>
            <Box className="pt-10 flex justify-between">
                <Box className='flex gap-5'>
                    <Box className='h-[20px] w-[61px] flex items-center justify-center rounded-full bg-[#D7D8FA]'>
                        <Text className='text-[11px] font-[500]'>BETA</Text>
                    </Box>
                    <Text className='text-white text-[14px]'>This site is a beta version, we appreciate all feedback to improve the platform</Text>
                    <Link href="/" className='text-white text-[14px] font-[500] underline'>Send Feedback</Link>
                </Box>
                <Image src="/assets/powered_by_logo.svg" alt='openearth-logo' width={142} height={32}/>
            </Box>
        </Box>
    </footer>
  )
}

export default Footer