import { Poppins } from 'next/font/google';

import { ChakraProvider } from "@chakra-ui/react";
import { Text } from '@chakra-ui/react';
import { Link } from '@chakra-ui/react';
import { Avatar } from '@chakra-ui/react';
import { Card, CardHeader, CardBody, CardFooter, Button } from '@chakra-ui/react'

import pageClassNames from "./PageClassNames";
import Image from "next/image";
import Logo from './Logo';
import { MdAnalytics, MdArrowDropDown, MdArrowForward, MdArrowOutward, MdArrowRight, MdArrowRightAlt, MdBarChart, MdDownload, MdEdit, MdEditSquare, MdFactory, MdFireTruck, MdGroup, MdInfoOutline, MdOutlineAddchart, MdOutlineAnalytics, MdOutlineAspectRatio } from 'react-icons/md';
import { PiTrashThin } from 'react-icons/pi';

const poppins = Poppins({
    weight: '400',
    subsets: ['latin'],
    display: 'swap',
    variable: '--font-poppins',
});

const Page = () => {

    const {
        root,
        header,
        container,
        logo,
        navLinks,
        active,
        nav,
        userControls,
        i18n,
        user,
        hero,
        container2,
        heroText,
        dataSection,
        footer,
        container3
    } = pageClassNames;


    return(
        <ChakraProvider>
            <div className={`${root} ${poppins.className}`}>
                <header className={header}>
                    <div className={container}>
                        <div className={logo}>
                            <Logo />
                            <Text fontSize="2xl" className="mt-7">CityCatalyst</Text>
                        </div>
                        <div className={nav}>
                            <div className={navLinks}>
                                <Link className={active}>Dashboard</Link>
                                <Link>City Status</Link>
                                <Link>Learning</Link>
                                <Link>About Us</Link>
                            </div>
                            <div className={userControls}>
                                <div className={i18n}>
                                    <Avatar className='h-[24px] w-[24px]' name='US' src='https://upload.wikimedia.org/wikipedia/commons/8/88/United-states_flag_icon_round.svg'/>
                                    <div className='flex items-center gap-4'>
                                        <Text className="mt-4">EN</Text>
                                        <MdArrowDropDown size={24}/>
                                    </div>
                                </div>
                                <div className={user}>
                                    <Avatar className='text-white h-[32px] w-[32px] text-[14px]' name='Mary'/>
                                    <Text className="mt-4">Mary Doe</Text>
                                </div>
                            </div>
                        </div>
                    </div>
                </header>
                <section className={hero}>
                    <div className={container2}>
                        <div className={heroText}>
                            <Text className='text-[16px] text-white top-7 relative'>Welcome,</Text>
                            <div className='flex items-center gap-4'>
                                <Avatar className='h-[32px] w-[32px]' name='Argentina' src='https://upload.wikimedia.org/wikipedia/commons/1/1a/Flag_of_Argentina.svg'/>
                                <Text className='flex top-6 relative text-white text-[45px]'>Ciudad Autónoma de Buenos Aires</Text>
                            </div>
                            <div className='flex gap-8'>
                                <div className='flex text-white align-baseline gap-3'>
                                    <div>
                                        <MdArrowOutward className='relative top-0' size={28}/>
                                    </div>
                                    <div>
                                        <Text className='text-[24px] font-[600]'>700<span className='text-[16px]'>Mtco2e</span></Text>
                                        <Text className='relative -top-5 text-[14px]'>in 2023</Text>
                                    </div>
                                </div>
                                <div className='flex text-white align-baseline gap-3'>
                                    <div>
                                        <MdGroup className='relative top-0' size={28}/>
                                    </div>
                                    <div>
                                        <Text className='text-[24px] font-[600]'>3,978.9<span className='text-[16px]'>M</span></Text>
                                        <Text className='relative -top-5 text-[14px]'>Total Population</Text>
                                    </div>
                                </div>
                                <div className='flex text-white align-baseline gap-3'>
                                    <div>
                                        <MdOutlineAspectRatio className='relative top-0' size={28}/>
                                    </div>
                                    <div>
                                        <Text className='text-[24px] font-[600]'>782<span className='text-[16px]'>km2</span></Text>
                                        <Text className='relative -top-5 text-[14px]'>Total land area</Text>
                                    </div>
                                </div>
                            </div>
                            <div className='flex relative justify-between'>
                                <Card className='border-2 border-[#5FE500] h-[188px] w-[254.5px]'>
                                    <CardHeader className='flex h-[20px] gap-2'>
                                        <MdOutlineAddchart className='text-[#008600]' size={24}/>
                                        <Text className='text-[#008600] relative top-0 font-[600]'>Add Data</Text>
                                    </CardHeader>
                                    <CardBody className='h-[75px]'>
                                        <p className='text-[16px]'>
                                            Add your own data or connect to third-party data to the inventory
                                        </p>
                                    </CardBody>
                                    <CardFooter className='flex justify-end'>
                                        <Button className='text-[#008600] gap-3' variant='ghost' colorScheme='blue'>
                                            <span>ADD DATA</span>
                                            <MdArrowForward size={24}/>
                                        </Button>
                                    </CardFooter>
                                </Card>
                                <Card className='h-[188px] w-[254.5px]'>
                                    <CardHeader className='flex h-[20px] gap-2'>
                                        <MdDownload className='text-[#2351DC]' size={24}/>
                                        <Text className='relative top-0 font-[600]'>Download</Text>
                                    </CardHeader>
                                    <CardBody className='h-[75px]'>
                                        <p className='text-[16px]'>
                                            Download a GPC format emissions inventory report
                                        </p>
                                    </CardBody>
                                    <CardFooter className='flex justify-end'>
                                        <Button className='text-[#2351DC] gap-3' variant='ghost' colorScheme='blue'>
                                            <span>DOWNLOAD REPORT</span>
                                            <MdArrowForward size={24}/>
                                        </Button>
                                    </CardFooter>
                                </Card>
                                <Card className='h-[188px] w-[254.5px]'>
                                    <CardHeader className='flex h-[20px] gap-2'>
                                        <MdBarChart className='text-[#2351DC]' size={24}/>
                                        <Text className='relative top-0 font-[600]'>City Status</Text>
                                    </CardHeader>
                                    <CardBody className='h-[75px]'>
                                        <p className='text-[16px]'>
                                            Visualize, analyze, and gain new insights about your city
                                        </p>
                                    </CardBody>
                                    <CardFooter className='flex justify-end'>
                                        <Button className='text-[#2351DC] gap-3' variant='ghost' colorScheme='blue'>
                                            <span>GO TO CITY STATUS</span>
                                            <MdArrowForward size={24}/>
                                        </Button>
                                    </CardFooter>
                                </Card>
                                <Card className='h-[188px] w-[254.5px]'>
                                    <CardHeader className='flex h-[20px] gap-2'>
                                        <MdOutlineAnalytics className='text-[#2351DC]' size={24}/>
                                        <Text className='relative top-0 font-[600]'>Integrations</Text>
                                    </CardHeader>
                                    <CardBody className='h-[75px]'>
                                        <p className='text-[16px]'>
                                            Lorem ipsum dolor sit amet consectetur. Egestas bibendum.
                                        </p>
                                    </CardBody>
                                    <CardFooter className='flex justify-end'>
                                        <Button className='text-[#2351DC] gap-3' variant='ghost' colorScheme='blue'>
                                            <span>SEE INTEGRATIONS</span>
                                            <MdArrowForward size={24}/>
                                        </Button>
                                    </CardFooter>
                                </Card>
                                
                            </div>
                        </div>
                    </div>
                </section>
                <section className={dataSection}>
                    <div className={container2}>
                        <div>
                            <Text className='text-[28px] font-[600]'>
                                City’s GHG Inventory Status
                            </Text>
                            <Text>
                                CityCatalyst provides data coverage using existing datasets and advanced machine learning analysis. Improve accuracy by completing your data. 
                                <Link className='text-[#2351DC] underline'>Learn more</Link> about our calculation methodology.
                            </Text>
                            <div className='w-full flex items-center justify-between h-[120px] border p-[24px] border-[#E8EAFB] rounded-[8px] mt-[40px]'>
                                <div>
                                    <div className='flex gap-2'>
                                        <Text className='font-[600] text-[22px]'>GPC Basic Standard</Text>
                                        <MdInfoOutline size={32} color='#7A7B9A'/>
                                    </div>
                                    <Text>City´s Inventory Goal</Text>
                                </div>
                                <div className='flex gap-5'>
                                    <Button className='border-2 bg-white border-[#2351DC] w-[256px] h-[48px] rounded-full gap-2'>
                                        <MdEditSquare color='#2351DC'/>
                                        <Text className='text-[#2351DC] text-[14px] relative top-2'>EDIT INVENTORY GOAL</Text>
                                    </Button>
                                    <Button className='bg-[#2351DC] w-[256px] h-[48px] rounded-full gap-2'>
                                        <Text className='text-white text-[14px] relative top-2'>ADD DATA TO INVENTORY</Text>
                                        <MdArrowForward color='white'/>
                                    </Button>
                                </div>
                            </div>
                            <div className='w-full flex flex-col h-[978px] border p-[24px] border-[#E8EAFB] rounded-[8px] mt-[40px]'>
                                <div className='flex flex-col gap-2 pb-10 border-b border-[#E8EAFB]'>
                                    <Text className='text-[22px] font-[600]'>
                                        2023 Emission inventory 
                                    </Text>
                                    <Text>
                                        This tracks how much data you have collected or integrated in order to be ready to calculate a GPC Basic Standard Inventory
                                    </Text>
                                    <div className='flex w-full justify-between items-center'>
                                        <div className='w-[850px] flex rounded-full h-[12px] bg-[#24BE00]'>
                                            <div className='h-full w-[239px] rounded-l-full bg-[#001EA7]' />
                                            <div className='h-full w-[308px] rounded-l-full bg-[#FA7200]' />
                                        </div>
                                        <Text className='font-[600] relative top-2'>
                                            100% completed
                                        </Text>
                                    </div>
                                    <div className='flex gap-5'>
                                        <div className='w-[285px] flex gap-2 px-3 items-center rounded-full h-[30px] border border-[#E8EAFB]'>
                                            <div className='h-[12px] w-[12px]  rounded-full bg-[#001EA7]'/>
                                            <Text className='text-[12px] relative top-[7px]'>21% Data provided by CityCatalyst ML</Text>
                                        </div>
                                        <div className='w-[285px] flex gap-2 px-3 items-center rounded-full h-[30px] border border-[#E8EAFB]'>
                                            <div className='h-[12px] w-[12px]  rounded-full bg-[#FA7200]'/>
                                            <Text className='text-[12px] relative top-[7px]'>47% Connected third-party data</Text>
                                        </div>
                                        <div className='w-[285px] flex gap-2 px-3 items-center rounded-full h-[30px] border border-[#E8EAFB]'>
                                            <div className='h-[12px] w-[12px]  rounded-full bg-[#24BE00]'/>
                                            <Text className='text-[12px] relative top-[7px]'>32% Uploaded data</Text>
                                        </div>
                                    </div>
                                </div>
                                <div className='w-full flex gap-5 h-[210px] items-center border-b border-[#E8EAFB]'>
                                    <div className='flex items-start h-[120px]'>
                                        <MdFactory color='#2351DC' size={32}/>
                                    </div>
                                    <div>
                                        <div className='flex gap-2'>
                                            <Text className='font-[600] text-[22px]'>GPC Basic Standard</Text>
                                            <MdInfoOutline size={32} color='#7A7B9A'/>
                                        </div>
                                        <Text>This sector deals with emissions from the transportation of goods and people within the city boundary</Text>
                                        <Text className='font-[600]'>Required Scope: 1,2</Text>
                                        <div className='flex w-full justify-between items-center'>
                                            <div className='w-[619px] flex rounded-full h-[12px] bg-[#E8EAFB]'>
                                                <div className='h-full w-[239px] rounded-l-full bg-[#001EA7]' />
                                                <div className='h-full w-[308px] rounded-l-full bg-[#24BE00]' />
                                            </div>
                                            <Text className='font-[600] relative top-2'>
                                                85%
                                            </Text>
                                        </div>
                                    </div>
                                    <div>
                                        <Button className='border-2 bg-white border-[#2351DC] w-[256px] h-[48px] rounded-full gap-2'>
                                            <Text className='text-[#2351DC] text-[14px] relative top-2'>ENHANCE SECTOR</Text>
                                            <MdArrowForward color='#2351DC'/>
                                        </Button>
                                    </div>
                                </div>
                                <div className='w-full flex gap-5 h-[210px] items-center border-b border-[#E8EAFB]'>
                                    <div className='flex items-start h-[120px]'>
                                        <MdFireTruck color='#2351DC' size={32}/>
                                    </div>
                                    <div>
                                        <div className='flex gap-2'>
                                            <Text className='font-[600] text-[22px]'>In-boundary transportation</Text>
                                            <MdInfoOutline size={32} color='#7A7B9A'/>
                                        </div>
                                        <Text>This sector deals with emissions from the transportation of goods and people within the city boundary</Text>
                                        <Text className='font-[600]'>Required Scope: 1</Text>
                                        <div className='flex w-full justify-between items-center'>
                                            <div className='w-[619px] flex rounded-full h-[12px] bg-[#E8EAFB]'>
                                                <div className='h-full w-[239px] rounded-l-full bg-[#001EA7]' />
                                            </div>
                                            <Text className='font-[600] relative top-2'>
                                                25%
                                            </Text>
                                        </div>
                                    </div>
                                    <div>
                                        <Button className='border-2 bg-white border-[#2351DC] w-[256px] h-[48px] rounded-full gap-2'>
                                            <Text className='text-[#2351DC] text-[14px] relative top-2'>ENHANCE SECTOR</Text>
                                            <MdArrowForward color='#2351DC'/>
                                        </Button>
                                    </div>
                                </div>
                                <div className='w-full flex gap-5 h-[210px] items-center'>
                                    <div className='flex items-start h-[120px]'>
                                        <PiTrashThin color='#2351DC' size={32}/>
                                    </div>
                                    <div>
                                        <div className='flex gap-2'>
                                            <Text className='font-[600] text-[22px]'>Waste and wastewater generated</Text>
                                            <MdInfoOutline size={32} color='#7A7B9A'/>
                                        </div>
                                        <Text>This sector covers emissions generated from waste management processes.</Text>
                                        <Text className='font-[600]'>Required Scope: 1, 3</Text>
                                        <div className='flex w-full justify-between items-center'>
                                            <div className='w-[619px] flex rounded-full h-[12px] bg-[#24BE00]'>
                                                <div className='h-full w-[239px] rounded-l-full bg-[#001EA7]' />
                                                <div className='h-full w-[108px] rounded-l-full bg-[#FA7200]' />
                                            </div>
                                            <Text className='font-[600] relative top-2'>
                                                100%
                                            </Text>
                                        </div>
                                    </div>
                                    <div>
                                        <Button className='border-2 bg-white border-[#2351DC] w-[256px] h-[48px] rounded-full gap-2'>
                                            <Text className='text-[#2351DC] text-[14px] relative top-2'>ENHANCE SECTOR</Text>
                                            <MdArrowForward color='#2351DC'/>
                                        </Button>
                                    </div>
                                </div>
                            </div>
                            <div className='pt-10'>
                                <Text className='text-[28px] font-[600]'>
                                    Download Data As
                                </Text>
                                <div className='flex justify-between'>
                                    <Card className='h-[236px] w-[347.5px]'>
                                        <CardHeader className='flex h-[20px] gap-2'>
                                            <MdDownload className='text-[#2351DC]' size={24}/>
                                            <Text className='relative top-0 font-[600]'>GPC Format</Text>
                                        </CardHeader>
                                        <CardBody className='h-[75px]'>
                                            <p className='text-[16px]'>
                                            Download your emission inventory in GPC compliant format to share with relevant stakeholders
                                            </p>
                                        </CardBody>
                                        <CardFooter className='flex'>
                                            <Button className='bg-[#2351DC] text-white w-full gap-3 rounded-full' variant='ghost' colorScheme='blue'>
                                                <MdDownload size={24}/>
                                                <span>DOWNLOAD REPORT</span>
                                            </Button>
                                        </CardFooter>
                                    </Card>
                                    <Card className='h-[236px] w-[347.5px]'>
                                        <CardHeader className='flex h-[20px] gap-2'>
                                            <MdDownload className='text-[#2351DC]' size={24}/>
                                            <Text className='relative top-0 font-[600]'>Raw CSV</Text>
                                        </CardHeader>
                                        <CardBody className='h-[75px]'>
                                            <p className='text-[16px]'>
                                                Download your climate data in raw CSV format to use in your own calculations, processing and presentations
                                            </p>
                                        </CardBody>
                                        <CardFooter className='flex'>
                                            <Button className='bg-[#2351DC] text-white w-full gap-3 rounded-full' variant='ghost' colorScheme='blue'>
                                                <MdDownload size={24}/>
                                                <span>DOWNLOAD REPORT</span>
                                            </Button>
                                        </CardFooter>
                                    </Card>
                                    <Card className='h-[236px] w-[347.5px]'>
                                        <CardHeader className='flex h-[20px] gap-2'>
                                            <MdDownload className='text-[#2351DC]' size={24}/>
                                            <Text className='relative top-0 font-[600]'>CDP Format</Text>
                                        </CardHeader>
                                        <CardBody className='h-[75px]'>
                                            <p className='text-[16px]'>
                                                Download your emission inventory and climate plans in CDP compliant format to share with relevant stakeholders
                                            </p>
                                        </CardBody>
                                        <CardFooter className='flex'>
                                            <Button className='bg-[#2351DC] text-white w-full gap-3 rounded-full' variant='ghost' colorScheme='blue'>
                                                <MdDownload size={24}/>
                                                <span>DOWNLOAD REPORT</span>
                                            </Button>
                                        </CardFooter>
                                    </Card>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
                <footer className={footer}>
                    <div className={container3}>
                        <div className='flex justify-between w-full pb-10'>
                            <div>
                                <Text className='text-white text-[18px] font-[600]'>CityCatalyst</Text>
                            </div>
                            <div className='text-white grid grid-cols-3 gap-10 '>
                                <Link>About Open Climate</Link>
                                <Link>Contribution Guide</Link>
                                <Link>Go to GitHub</Link>
                                <Link>CAD2.0 Community</Link>
                                <Link>Read the docs</Link>
                                <Link>Python Client Docs</Link>
                            </div>
                            <div>
                                <Button className='bg-[#2351DC] text-white h-[48px] w-[150px] gap-3 rounded-full' variant='ghost' colorScheme='blue'>
                                    <span>CONTACT US</span>
                                </Button>
                            </div>
                        </div>
                        <hr />
                        <div className="pt-10 flex justify-between">
                            <div className='flex gap-5'>
                                <div className='h-[20px] w-[61px] flex items-center justify-center rounded-full bg-[#D7D8FA]'>
                                    BETA
                                </div>
                                <Text className='text-white'>This site is a beta version, we appreciate all feedback to improve the platform</Text>
                                <Link className='text-white font-[600]'>Send Feedback</Link>
                            </div>
                            <Text className='text-white font-[600] text-[16px]'>OpenEarth</Text>
                        </div>
                    </div>
                </footer>
            </div>
            
        </ChakraProvider>
    )
}

export default Page;
