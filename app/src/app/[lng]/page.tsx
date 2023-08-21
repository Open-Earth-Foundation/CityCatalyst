'use client'

import { NavigationBar } from '@/components/navigation-bar'
import { Avatar, Button, Card, CardBody, CardFooter, CardHeader, Heading, Text } from '@chakra-ui/react'
import Link from 'next/link'
import pageClassNames from './PageClassNames'
import { MdArrowForward, MdArrowOutward, MdBarChart, MdDownload, MdFireTruck, MdGroup, MdInfoOutline, MdOutlineAddchart, MdOutlineAnalytics, MdOutlineAspectRatio } from 'react-icons/md'
import {BsTruck} from 'react-icons/bs';
import {PiTrashLight} from 'react-icons/pi'
import Image from 'next/image'
import {FiDownload} from 'react-icons/fi'
import { InfoOutlineIcon } from '@chakra-ui/icons'
import { Open_Sans } from 'next/font/google';
import {TbBuildingCommunity} from 'react-icons/tb';

const opensans = Open_Sans({
  subsets: ["latin"],
  weight: ['300', '400']
})

export default function Home({ params: { lng } }: { params: { lng: string } }) {
  return (
    <main>
      <NavigationBar lng={lng} />
      <section className={pageClassNames.hero}>
        <div className={pageClassNames.container2}>
            <div className={pageClassNames.heroText}>
                <div className='flex  h-[240px]'>
                  <div className='flex gap-[24px] flex-col h-full w-full'>
                    <Text className='text-[24px] text-[#C5CBF5] leading-[52px] text-hi font-[600] relative'>Welcome Back,</Text>
                    <div className='flex items-center gap-4 w-[644px] h-[104px]'>
                        <Avatar className='h-[32px] w-[32px]' name='Argentina' src='https://upload.wikimedia.org/wikipedia/commons/1/1a/Flag_of_Argentina.svg'/>
                        <Text className='flex relative font-[600] text-white text-[45px]'>Ciudad Autónoma de Buenos Aires</Text>
                    </div>
                    <div className='flex gap-8 mt-[24px]'>
                        <div className='flex text-white align-baseline gap-3'>
                            <div>
                                <MdArrowOutward className='relative top-0' size={28} fill='#5FE500'/>
                            </div>
                            <div>
                                <div className='flex gap-1'>
                                  <Text className='text-[24px] font-[600]'>700<span className='text-[16px]'>Mtco2e</span></Text>
                                  <InfoOutlineIcon w={3} h={3} color={"#C5CBF5"}/>
                                </div>
                                <Text className='relative -top-1 text-[14px] text-[#C5CBF5]'>in 2023</Text>
                            </div>
                        </div>
                        <div className='flex text-white align-baseline gap-3'>
                            <div>
                                <MdGroup className='relative top-0' size={28} fill='#C5CBF5'/>
                            </div>
                            <div>
                                <div className='flex gap-1'>
                                  <Text className='text-[24px] font-[600]'>3,978.9<span className='text-[16px]'>M</span></Text>
                                  <InfoOutlineIcon w={3} h={3} color={"#C5CBF5"}/>
                                </div>
                                <Text className='relative -top-1 text-[14px] text-[#C5CBF5]'>Total Population</Text>
                            </div>
                        </div>
                        <div className='flex text-white align-baseline gap-3'>
                            <div>
                                <MdOutlineAspectRatio className='relative top-0' size={28} fill='#C5CBF5'/>
                            </div>
                            <div>
                                <div className='flex gap-1'>
                                  <Text className='text-[24px] font-[600]'>782<span className='text-[16px]'>km2</span></Text>
                                  <InfoOutlineIcon w={3} h={3} color={"#C5CBF5"}/>
                                </div>
                                <Text className='relative -top-1 text-[14px] text-[#C5CBF5]'>Total land area</Text>
                            </div>
                        </div>
                    </div>
                  </div>
                  <div>
                    <Image src="/assets/map_placeholder.png" alt=""  width={622} height={517}/>
                  </div>
                </div>
                <div className='flex gap-[24px] relative justify-between top-[122px]'>
                    <Card className='border-2 border-[#5FE500] h-[132px] w-[533px] px-[24px] shadow-[0px 2px 4px -2px rgba(109, 255, 40, 0.20), 0px 4px 6px -1px rgba(0, 0, 0, 0.10)]'>
                        <div className='flex items-center w-fill'>
                          <div>
                              <div className='flex items-center justify-center h-[48px] w-[48px] rounded-full bg-[#008600]'>
                                <MdOutlineAddchart className='text-white' size={24}/>
                              </div>
                          </div>
                          <div>
                            <CardHeader className='flex h-[20px] gap-2'>
                                <Text className='text-[#008600] text-[22px] relative top-0 font-[600]'>Add Data to Inventory</Text>
                            </CardHeader>
                            <CardBody className='h-[75px]'>
                                <p className='text-[16px] text-[#232640]'>
                                  Upload data or connect third-party data to complete the GPC Basic Emissions Inventory
                                </p>
                            </CardBody>
                          </div>
                        </div>
                    </Card>
                    <Card className='h-[132px] w-[533px] px-[24px] shadow-[0px 2px 4px -2px rgba(109, 255, 40, 0.20), 0px 4px 6px -1px rgba(0, 0, 0, 0.10)]'>
                        <div className='flex items-center w-fill'>
                          <div>
                              <div className='flex items-center justify-center h-[48px] w-[48px] rounded-full bg-[#2351DC]'>
                                <FiDownload className='text-white' size={24}/>
                              </div>
                          </div>
                          <div>
                            <CardHeader className='flex h-[20px] gap-2'>
                                <Text className='text-[#2351DC] text-[22px] relative top-0 font-[600]'>Download</Text>
                            </CardHeader>
                            <CardBody className='h-[75px]'>
                                <p className='text-[16px] text-[#232640]'>
                                  View and download your inventory data in CSV or GPC format and share your progress
                                </p>
                            </CardBody>
                          </div>
                        </div>
                    </Card>
              </div>
              </div>
          </div>
      </section>
      <section className='h-full bg-[#fafafa] pt-[128px] pb-[100px]'>
        <div className={pageClassNames.container2}>
            <div className='flex flex-col gap-[8px] w-full h-300'>
              <div className='flex items-center gap-3'>
                <Text className='font-[600] text-[24px]'>GPC Basic Emission Inventory Calculation - Year 2023</Text>
                <InfoOutlineIcon color={"#7A7B9A"}/>
              </div>
              <Text className={`font-[400] ${opensans.className} text-[16px] text-[#7A7B9A] leadin-[0.5px] `}>
                The data you have submitted is now officially incorporated into your city&apos;s 2023 GHG Emissions Inventory, compiled according to the GPC Basic methodology. <Link href={"/"} className='text-[#2351DC] font-[700] underline'>Learn more</Link> about GPC Protocol
              </Text>
              <div className='flex w-full justify-between items-center mt-2'>
                  <div className='w-[850px] flex rounded-full h-[16px] bg-[#24BE00]'>
                    <div className='h-full w-[308px] bg-[#FA7200] rounded-[8px]' />
                  </div>
                  <Text className='font-[600] relative'>
                      100% completed
                  </Text>
              </div>
              <div className='flex gap-5 mt-[16px]'>
                  <div className='w-[279px] flex gap-2 px-3 items-center justify-center rounded-full h-[30px] border border-[#E8EAFB]'>
                      <div className='h-[12px] w-[12px]  rounded-full bg-[#FA7200]'/>
                      <Text className='text-[12px] relative'>33% Connected third-party data</Text>
                  </div>
                  <div className='w-[192px] flex gap-2 px-3 items-center justify-center rounded-full h-[30px] border border-[#E8EAFB]'>
                      <div className='h-[12px] w-[12px]  rounded-full bg-[#24BE00]'/>
                      <Text className='text-[12px] relative'>66% Uploaded data</Text>
                  </div>
              </div>
              <div className=' flex flex-col gap-[24px] py-[48px]'>
                <Text className='text-[16px] font-[600]'>Sectors required from inventory</Text>
                  <div className='w-full flex gap-5 h-[268px] bg-white rounded-lg px-6 py-8'>
                    <div className='flex items-start mt-2'>
                        <TbBuildingCommunity color='#2351DC' size={32}/>
                    </div>
                    <div className=''>
                        <div className='flex items-center justify-between'>
                            <div className='flex flex-col'>
                                <div className='flex gap-2 py-1 w-[715px]'>
                                    <Text className='font-[600] text-[22px]'>Stationary Energy</Text>
                                </div>
                                <Text className='text-[#7A7B9A] mb-[16px]'>This sector deals with emissions that result from the generation of electricity, heat, and steam, as well as their consumption.</Text>
                                <Text className='font-[600]'>Scope Required for GPC Basic Inventory: 1, 2</Text>
                            </div>
                            <div>
                                <Button className='border-2 bg-white border-[#2351DC] w-[256px] h-[48px] rounded-full gap-2'>
                                    <Text className='text-[#2351DC] text-[14px] relative'>ADD DATA TO SECTOR</Text>
                                    <MdArrowForward color='#2351DC'/>
                                </Button>
                            </div>
                        </div>
                        <div className='flex w-full justify-between items-center just'>
                            <div className='w-[848px] flex rounded-full h-[8px] bg-[#24BE00]'>
                                <div className='h-full w-[239px] rounded-l-full bg-[#FA7200]' />
                            </div>
                            <Text className='font-[600] relative text-[14px]'>
                                100% Completed
                            </Text>
                        </div>
                    </div>
                </div>
                <div className='w-full flex gap-5 h-[268px] bg-white rounded-lg px-6 py-8'>
                  <div className='flex items-start mt-2'>
                      <BsTruck color='#2351DC' size={32}/>
                  </div>
                  <div className=''>
                      <div className='flex items-center justify-between'>
                          <div className='flex flex-col'>
                              <div className='flex gap-2 py-1 w-[715px]'>
                                  <Text className='font-[600] text-[22px]'>Transportation</Text>
                              </div>
                              <Text className='text-[#7A7B9A] mb-[16px]'>This sector deals with emissions from the transportation of goods and people within the city boundary.</Text>
                              <Text className='font-[600]'>Scope Required for GPC Basic Inventory: 1, 2</Text>
                          </div>
                          <div>
                              <Button className='border-2 bg-white border-[#2351DC] w-[256px] h-[48px] rounded-full gap-2'>
                                  <Text className='text-[#2351DC] text-[14px] relative'>ADD DATA TO SECTOR</Text>
                                  <MdArrowForward color='#2351DC'/>
                              </Button>
                          </div>
                      </div>
                      <div className='flex w-full justify-between items-center just'>
                          <div className='w-[848px] flex rounded-full h-[8px] bg-[#24BE00]'>
                              
                          </div>
                          <Text className='font-[600] relative text-[14px]'>
                              100% Completed
                          </Text>
                      </div>
                  </div>
                </div>
                <div className='w-full flex gap-5 h-[268px] bg-white rounded-lg px-6 py-8'>
                  <div className='flex items-start mt-2'>
                      <PiTrashLight color='#2351DC' size={32}/>
                  </div>
                  <div className=''>
                      <div className='flex items-center justify-between'>
                          <div className='flex flex-col'>
                              <div className='flex gap-2 py-1 w-[715px]'>
                                  <Text className='font-[600] text-[22px]'>Waste and wastewater</Text>
                              </div>
                              <Text className='text-[#7A7B9A] mb-[16px]'>This sector covers emissions generated from waste management processes.</Text>
                              <Text className='font-[600]'>Scope Required for GPC Basic Inventory: 1, 2</Text>
                          </div>
                          <div>
                              <Button className='border-2 bg-white border-[#2351DC] w-[256px] h-[48px] rounded-full gap-2'>
                                  <Text className='text-[#2351DC] text-[14px] relative'>ADD DATA TO SECTOR</Text>
                                  <MdArrowForward color='#2351DC'/>
                              </Button>
                          </div>
                      </div>
                      <div className='flex w-full justify-between items-center just'>
                          <div className='w-[848px] flex rounded-full h-[8px] bg-[#24BE00]'>
                              
                          </div>
                          <Text className='font-[600] relative text-[14px]'>
                              100% Completed
                          </Text>
                      </div>
                  </div>
                </div>
              </div>
            </div>
        </div>
      </section>
    </main>
  )
}
