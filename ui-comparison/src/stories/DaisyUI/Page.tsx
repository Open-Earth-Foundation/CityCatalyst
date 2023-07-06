import React from "react";
import { Poppins } from 'next/font/google';
import { MdAddchart, MdArrowForward, MdBarChart, MdOutlineAnalytics, MdArrowOutward, MdOutlinePeopleAlt, MdAspectRatio, MdOutlineHomeWork } from 'react-icons/md';
import { FaFileExport } from 'react-icons/fa';
import { PiNotePencil, PiTrashLight } from 'react-icons/pi';
import { BsTruck } from 'react-icons/bs';
import { FiDownload } from 'react-icons/fi';

import { Header } from "./Header";
import { Footer } from "./Footer";

const poppins = Poppins({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-poppins',
});

export function Page() {
  return (
    <div className={`CityDashboard w-[1440px] h-[2755px] relative bg-white ${poppins.className}`}>
      <Header />
      <div className="Rectangle1 w-[1440px] h-[407px] left-0 top-[84px] absolute bg-blue-800" />
      <div className="Cards h-[188px] left-[175px] top-[392px] absolute flex-col justify-start items-start gap-6 inline-flex">
        <div className="Frame27052 w-[1090px] justify-start items-start gap-6 inline-flex">
          <div className="Datasourcecard grow shrink basis-0 p-6 bg-white rounded-lg shadow border-lime-500 flex-col justify-start items-center gap-4 inline-flex">
            <div className="Frame27049 flex-col justify-start items-start gap-2 flex">
              <div className="Frame9 w-48 justify-start items-center gap-2 inline-flex">
                <div className="AddChart w-8 h-8 relative">
                  <MdAddchart className="text-green-700" size={32} />
                </div>
                <div className="AddData grow shrink basis-0 text-green-700 text-[22px] font-semibold leading-7">Add Data</div>
              </div>
              <div className="AddYourOwnDataOrConnectToThirdPartyDataToTheInventory w-48 text-black text-[14px] font-normal leading-tight tracking-wide">Add your own data or connect to third-party data to the inventory</div>
            </div>
            <div className="Frame27046 justify-center items-center gap-2 inline-flex">
              <div className="AddData w-48 text-right text-green-700 text-[14px] font-semibold uppercase leading-none tracking-widest">
                Add Data
              </div>
              <div className="ArrowForward w-6 h-6 relative">
                <MdArrowForward className="text-green-700" size={24} />
              </div>
            </div>
          </div>
          <div className="Datasourcecard grow shrink basis-0 self-stretch p-6 bg-white rounded-lg shadow flex-col justify-start items-center gap-4 inline-flex">
            <div className="Frame27050 w-48 grow shrink basis-0 flex-col justify-start items-start gap-2 flex">
              <div className="Frame9 w-48 justify-start items-center gap-2 inline-flex">
                <div className="SolarExportLinear w-8 h-8 relative">
                  <FaFileExport className="text-blue-700" size={32} />
                  <div className="Group w-[21.33px] h-[21.33px] left-[5.33px] top-[5.33px] absolute">
                  </div>
                </div>
                <div className="CityStatus grow shrink basis-0 text-black text-[22px] font-semibold leading-7">Download</div>
              </div>
              <div className="DownloadAGpcFormatEmissionsInventoryReport w-48 text-black text-[14px] font-normal leading-tight tracking-wide">Download a GPC format emissions inventory report</div>
            </div>
            <div className="Frame27045 justify-center items-center gap-2 inline-flex">
              <div className="GoToCityStatus w-48 text-right text-blue-700 text-[14px] font-semibold uppercase leading-none tracking-widest">Download Report</div>
              <div className="ArrowForward w-6 h-6 relative">
                <MdArrowForward className="text-blue-700" size={24} />
              </div>
            </div>
          </div>
          <div className="Datasourcecard grow shrink basis-0 p-6 bg-white rounded-lg shadow flex-col justify-start items-center gap-4 inline-flex">
            <div className="Frame27050 flex-col justify-start items-start gap-2 flex">
              <div className="Frame9 w-48 justify-start items-center gap-2 inline-flex">
                <div className="BarChart w-8 h-8 relative">
                  <MdBarChart className="text-blue-700" size={32} />
                </div>
                <div className="CityStatus grow shrink basis-0 text-black text-[22px] font-semibold leading-7">City Status</div>
              </div>
              <div className="VisualizeAnalyzeAndGainNewInsightsAboutYourCity w-48 text-black text-[14px] font-normal leading-tight tracking-wide">Visualize, analyze, and gain new insights about your city</div>
            </div>
            <div className="Frame27045 justify-center items-center gap-2 inline-flex">
              <div className="GoToCityStatus w-48 text-right text-blue-700 text-[14px] font-semibold uppercase leading-none tracking-widest">Go to City Status</div>
              <div className="ArrowForward w-6 h-6 relative">
                <MdArrowForward className="text-blue-700" size={24} />
              </div>
            </div>
          </div>
          <div className="Datasourcecard grow shrink basis-0 p-6 bg-white rounded-lg shadow flex-col justify-start items-center gap-4 inline-flex">
            <div className="Frame27050 flex-col justify-start items-start gap-2 flex">
              <div className="Frame9 w-48 justify-start items-center gap-2 inline-flex">
                <div className="Analytics w-8 h-8 relative">
                  <MdOutlineAnalytics className="text-blue-700" size={32} />
                </div>
                <div className="CityStatus grow shrink basis-0 text-black text-[22px] font-semibold leading-7">Integrations</div>
              </div>
              <div className="LoremIpsumDolorSitAmetConsecteturEgestasBibendum w-48 text-black text-[14px] font-normal leading-tight tracking-wide">Lorem ipsum dolor sit amet consectetur. Egestas bibendum.</div>
            </div>
            <div className="Frame27045 justify-center items-center gap-2 inline-flex">
              <div className="GoToCityStatus w-48 text-right text-blue-700 text-[14px] font-semibold uppercase leading-none tracking-widest">See Integrations</div>
              <div className="ArrowForward w-6 h-6 relative">
                <MdArrowForward className="text-blue-700" size={24} />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="Title h-[180px] left-[175px] top-[148px] absolute flex-col justify-start items-start gap-6 inline-flex">
        <div className="Welcome self-stretch text-white text-[16px] font-normal leading-normal tracking-wide">Welcome,</div>
        <div className="Header w-[1090px] justify-start items-center gap-4 inline-flex">
          <div className="Flag w-8 h-8 relative">
            <div className="Group w-[28.82px] h-8 left-[1.59px] top-0 absolute">
            </div>
          </div>
          <div className="Title justify-start items-center gap-6 flex">
            <div className="CiudadAutNomaDeBuenosAires text-white text-[45px] font-semibold leading-10">Ciudad Autónoma de Buenos Aires</div>
          </div>
        </div>
        <div className="Info self-stretch justify-start items-center gap-4 space-x-3 inline-flex">
          <div className="TotalPopulation h-14 justify-start items-start gap-3 flex">
            <div className="Frame6905 w-6 justify-start items-center gap-2.5 flex">
              <div className="ArrowOutward w-6 h-6 relative mt-3">
                <MdArrowOutward className="text-white" size={24} />
              </div>
            </div>
            <div className="Frame3003 grow shrink basis-0 flex-col justify-center items-start gap-1 inline-flex">
              <div className="Frame6815 self-stretch justify-start items-start gap-1 inline-flex">
                <div className="Mtco2e grow shrink basis-0"><span className="text-violet-100 text-[24px] font-semibold leading-loose">700</span><span className="text-violet-100 text-[16px] font-semibold leading-normal">Mtco2e</span></div>
              </div>
              <div className="In2023 self-stretch text-violet-100 text-[14px] font-normal leading-tight tracking-wide">in 2023</div>
            </div>
          </div>
          <div className="TotalPopulation h-14 justify-start items-start gap-3 flex">
            <div className="Frame6905 w-6 justify-start items-center gap-2.5 flex">
              <div className="Icons w-6 h-6 relative mt-3">
                <MdOutlinePeopleAlt className="text-white" size={24} />
              </div>
            </div>
            <div className="Frame3003 grow shrink basis-0 flex-col justify-center items-start gap-1 inline-flex">
              <div className="Frame6815 self-stretch justify-start items-start gap-1 inline-flex">
                <div className="9789m"><span className="text-violet-100 text-[24px] font-semibold leading-loose">3,978.9</span><span className="text-violet-100 text-[16px] font-semibold leading-normal">M</span></div>
              </div>
              <div className="TotalPopulation self-stretch text-violet-100 text-[14px] font-normal leading-tight tracking-wide">Total population</div>
            </div>
          </div>
          <div className="TotalPopulation h-14 justify-start items-start gap-3 flex">
            <div className="Frame6905 w-6 justify-start items-center gap-2.5 flex">
              <div className="AspectRatio w-6 h-6 relative mt-3">
                <MdAspectRatio className="text-white" size={24} />
              </div>
            </div>
            <div className="Frame3003 grow shrink basis-0 flex-col justify-center items-start gap-1 inline-flex">
              <div className="Frame6815 self-stretch justify-start items-start gap-1 inline-flex">
                <div className="Km2"><span className="text-violet-100 text-[24px] font-semibold leading-loose">782</span><span className="text-violet-100 text-[16px] font-semibold leading-normal">km2</span></div>
              </div>
              <div className="TotalLandArea self-stretch text-violet-100 text-[14px] font-normal leading-tight tracking-wide">Total land area</div>
            </div>
          </div>
        </div>
      </div>
      <div className="Frame26976 left-[175px] top-[644px] absolute flex-col justify-start items-start gap-12 inline-flex">
        <div className="Frame26975 h-[93px] flex-col justify-start items-start gap-4 flex">
          <div className="Frame26973 self-stretch justify-start items-center gap-6 inline-flex">
            <div className="CitySGhgInventoryStatus grow shrink basis-0 text-slate-950 text-[28px] font-semibold leading-9">City’s GHG Inventory Status</div>
          </div>
          <div className="CitycatalystProvidesDataCoverageUsingExistingDatasetsAndAdvancedMachineLearningAnalysisImproveAccuracyByCompletingYourDataLearnMoreAboutOurCalculationMethodology self-stretch"><span className="text-slate-950 text-[14px] font-normal leading-tight tracking-wide">CityCatalyst provides data coverage using existing datasets and advanced machine learning analysis. Improve accuracy by completing your data. <br /></span><span className="text-blue-700 text-[14px] font-medium underline leading-tight tracking-wide">Learn more</span><span className="text-blue-700 text-[14px] font-normal leading-tight tracking-wide"> </span><span className="text-slate-950 text-[14px] font-normal leading-tight tracking-wide">about our calculation methodology.</span></div>
        </div>
        <div className="Datasourcecard h-[120px] px-6 py-8 bg-white rounded-lg border border-violet-100 flex-col justify-center items-start gap-6 flex">
          <div className="Frame26966 self-stretch justify-start items-center gap-6 inline-flex">
            <div className="Frame26973 grow shrink basis-0 flex-col justify-start items-start gap-2 inline-flex">
              <div className="Frame9 justify-start items-center gap-2 inline-flex">
                <div className="GpcBasicStandard text-slate-950 text-[22px] font-semibold leading-7">GPC Basic Standard</div>
                <div className="Info w-6 h-6 relative" />
              </div>
              <div className="CitySInventoryGoal text-slate-950 text-[14px] font-normal leading-tight tracking-wide">City´s Inventory Goal</div>
            </div>
            <div className="Button w-64 px-6 py-4 rounded-[50px] border border-blue-700 justify-center items-center gap-2 flex">
              <PiNotePencil size={24} className="text-blue-700" />
              <div className="Secondary text-center text-blue-700 text-[13px] font-semibold uppercase leading-none tracking-widest">edit inventory goal</div>
            </div>
            <div className="Button w-[282px] px-6 py-4 bg-blue-700 rounded-[50px] justify-center items-center gap-2 flex">
              <div className="Primary text-center text-white text-[13px] font-semibold uppercase leading-none tracking-widest">Add data to inventory</div>
              <MdArrowForward size={24} className="text-white" />
            </div>
          </div>
        </div>
        <div className="Datasourcecard h-[978px] px-6 py-8 bg-white rounded-lg border border-violet-100 flex-col justify-start items-end gap-6 flex">
          <div className="Frame26978 flex-col justify-start items-start gap-4 flex">
            <div className="Title w-[1042px] justify-start items-center gap-6 inline-flex">
              <div className="Frame26966 grow shrink basis-0 flex-col justify-start items-start gap-4 inline-flex">
                <div className="Frame9 self-stretch justify-end items-start gap-3 inline-flex">
                  <div className="EmissionInventory grow shrink basis-0 text-slate-950 text-[22px] font-semibold leading-7">2023 Emission inventory </div>
                </div>
                <div className="ThisTracksHowMuchDataYouHaveCollectedOrIntegratedInOrderToBeReadyToCalculateAGpcBasicStandardInventory text-slate-950 text-[14px] font-normal leading-tight tracking-wide">This tracks how much data you have collected or integrated in order to be ready to calculate a GPC Basic Standard Inventory</div>
              </div>
            </div>
            <div className="Frame26976 w-[1042px] h-8 pr-[182px] flex-col justify-center items-start gap-2.5 flex">
              <div className="ProgressBar w-[1042px] justify-start items-center gap-6 inline-flex">
                <div className="Group26974 grow shrink basis-0 h-3 relative">
                  <div className="Bgd w-[887px] h-3 left-0 top-0 absolute bg-violet-100 rounded-xl" />
                  <div className="Fill w-[887px] h-3 left-0 top-0 absolute bg-lime-600 rounded-xl" />
                  <div className="Fill w-[608px] h-3 left-0 top-0 absolute bg-orange-500 rounded-xl" />
                  <div className="Fill w-[239.70px] h-3 left-0 top-0 absolute bg-blue-800 rounded-xl" />
                </div>
                <div className="Completed text-center text-slate-950 text-[16px] font-bold leading-relaxed">100% completed</div>
              </div>
            </div>
            <div className="Legend w-[1042px] justify-start items-start gap-4 inline-flex">
              <div className="Chip px-3 py-1 bg-white rounded-[50px] border border-violet-100 justify-start items-center gap-2 flex">
                <div className="Icons w-6 h-6 relative">
                  <div className="BoundingBox w-6 h-6 left-0 top-0 absolute bg-white" />
                </div>
                <div className="DataProvidedByCitycatalystMl text-slate-950 text-[12px] font-normal leading-none tracking-wide">21% Data provided by CityCatalyst ML</div>
              </div>
              <div className="Chip px-3 py-1 bg-white rounded-[50px] border border-violet-100 justify-start items-center gap-2 flex">
                <div className="Icons w-6 h-6 relative">
                  <div className="BoundingBox w-6 h-6 left-0 top-0 absolute bg-white" />
                </div>
                <div className="ConnectedThirdPartyData text-slate-950 text-[12px] font-normal leading-none tracking-wide">47% Connected third-party data</div>
              </div>
              <div className="Chip px-3 py-1 bg-white rounded-[50px] border border-violet-100 justify-start items-center gap-2 flex">
                <div className="Icons w-6 h-6 relative">
                  <div className="BoundingBox w-6 h-6 left-0 top-0 absolute bg-white" />
                </div>
                <div className="UploadedData text-slate-950 text-[12px] font-normal leading-none tracking-wide">32% Uploaded data</div>
              </div>
            </div>
          </div>
          <div className="Divider self-stretch h-[0px] border-violet-100"></div>
          <div className="Frame26979 self-stretch p-6 rounded-lg justify-start items-center gap-12 inline-flex">
            <div className="Frame26966 grow shrink basis-0 h-[162px] justify-start items-center gap-12 flex">
              <div className="Frame27093 grow shrink basis-0 flex-col justify-start items-start gap-4 inline-flex">
                <div className="Frame26973 self-stretch justify-start items-start gap-4 inline-flex">
                  <div className="HomeWork w-8 h-8 relative">
                    <MdOutlineHomeWork size={32} className="text-blue-700" />
                  </div>
                  <div className="Frame26973 grow shrink basis-0 flex-col justify-start items-start gap-4 inline-flex">
                    <div className="Frame26973 justify-start items-center gap-2 inline-flex">
                      <div className="StationaryEnergy text-slate-800 text-[22px] font-semibold leading-7">Stationary energy</div>
                      <div className="Info w-6 h-6 relative" />
                    </div>
                    <div className="ThisSectorDealsWithEmissionsThatResultFromTheGenerationOfElectricityHeatAndSteamAsWellAsTheirConsumption self-stretch text-slate-950 text-[14px] font-normal leading-tight tracking-wide">This sector deals with emissions that result from the generation of electricity, heat, and steam, as well as their consumption</div>
                    <div className="Frame68 w-[288.33px] justify-start items-start gap-4 inline-flex">
                      <div className="RequiredScope12 text-slate-950 text-[14px] font-medium leading-tight tracking-wide">Required Scope: 1, 2</div>
                    </div>
                  </div>
                </div>
                <div className="Frame26973 self-stretch pl-12 justify-start items-center gap-6 inline-flex">
                  <div className="ProgressBar w-[619px] h-3 relative rounded-2xl">
                    <div className="Bgd w-[619px] h-3 left-0 top-0 absolute bg-violet-100 rounded-2xl" />
                    <div className="Fill w-[537.09px] h-3 left-0 top-0 absolute bg-lime-600 rounded-2xl" />
                    <div className="Fill w-[211.49px] h-3 left-0 top-0 absolute bg-blue-800 rounded-2xl" />
                  </div>
                  <div className=" text-center text-slate-950 text-[16px] font-bold leading-relaxed">85%</div>
                </div>
              </div>
              <div className="Button w-[221px] px-6 py-4 rounded-[50px] border border-blue-700 justify-center items-center gap-2 flex">
                <div className="Primary text-center text-blue-700 text-[13px] font-semibold uppercase leading-none tracking-widest">enhance sector</div>
                <MdArrowForward size={24} className="text-blue-700" />
              </div>
            </div>
          </div>
          <div className="Divider self-stretch h-[0px] border-violet-100"></div>
          <div className="Frame26981 self-stretch p-6 rounded-lg justify-start items-center gap-12 inline-flex">
            <div className="Frame26966 grow shrink basis-0 h-[162px] justify-start items-center gap-12 flex">
              <div className="Frame27093 grow shrink basis-0 flex-col justify-start items-start gap-4 inline-flex">
                <div className="Frame26973 self-stretch justify-start items-start gap-4 inline-flex">
                  <div className="Truck w-8 h-8 relative">
                    <BsTruck size={32} className="text-blue-700" />
                  </div>
                  <div className="Frame26973 grow shrink basis-0 flex-col justify-start items-start gap-4 inline-flex">
                    <div className="Frame26973 justify-start items-center gap-2 inline-flex">
                      <div className="InBoundaryTransportation text-slate-800 text-[22px] font-semibold leading-7">In-boundary transportation</div>
                      <div className="Info w-6 h-6 relative" />
                    </div>
                    <div className="ThisSectorDealsWithEmissionsFromTheTransportationOfGoodsAndPeopleWithinTheCityBoundary self-stretch text-slate-950 text-[14px] font-normal leading-tight tracking-wide">This sector deals with emissions from the transportation of goods and people within the city boundary</div>
                    <div className="Frame68 w-[288.33px] justify-start items-start gap-4 inline-flex">
                      <div className="RequiredScope1 text-slate-950 text-[14px] font-medium leading-tight tracking-wide">Required Scope: 1</div>
                    </div>
                  </div>
                </div>
                <div className="Frame26973 self-stretch pl-12 justify-start items-center gap-6 inline-flex">
                  <div className="ProgressBar w-[619px] h-3 relative rounded-2xl">
                    <div className="Bgd w-[619px] h-3 left-0 top-0 absolute bg-violet-100 rounded-2xl" />
                    <div className="Fill w-[211.49px] h-3 left-0 top-0 absolute bg-blue-800 rounded-2xl" />
                  </div>
                  <div className=" text-center text-slate-950 text-[16px] font-bold leading-relaxed">25%</div>
                </div>
              </div>
              <div className="Button w-[221px] px-6 py-4 rounded-[50px] border border-blue-700 justify-center items-center gap-2 flex">
                <div className="Primary text-center text-blue-700 text-[13px] font-semibold uppercase leading-none tracking-widest">enhance sector</div>
                <MdArrowForward size={24} className="text-blue-700" />
              </div>
            </div>
          </div>
          <div className="Divider self-stretch h-[0px] border-violet-100"></div>
          <div className="Frame26982 self-stretch p-6 rounded-lg justify-start items-center gap-12 inline-flex">
            <div className="Frame26966 grow shrink basis-0 h-[142px] justify-start items-center gap-12 flex">
              <div className="Frame27093 grow shrink basis-0 flex-col justify-start items-start gap-4 inline-flex">
                <div className="Frame26973 self-stretch justify-start items-start gap-4 inline-flex">
                  <div className="Trash2 w-8 h-8 relative">
                    <PiTrashLight size={32} className="text-blue-700" />
                  </div>
                  <div className="Frame26973 grow shrink basis-0 flex-col justify-start items-start gap-4 inline-flex">
                    <div className="Frame26973 justify-start items-center gap-2 inline-flex">
                      <div className="WasteAndWastewaterGenerated text-slate-800 text-[22px] font-semibold leading-7">Waste and wastewater generated</div>
                      <div className="Info w-6 h-6 relative" />
                    </div>
                    <div className="SectorEmissions self-stretch text-slate-950 text-[14px] font-normal leading-tight tracking-wide">This sector covers emissions generated from waste management processes.</div>
                    <div className="Frame68 w-[288.33px] justify-start items-start gap-4 inline-flex">
                      <div className="RequiredScope13 text-slate-950 text-[14px] font-medium leading-tight tracking-wide">Required Scope: 1, 3</div>
                    </div>
                  </div>
                </div>
                <div className="Frame26973 self-stretch pl-12 justify-start items-center gap-6 inline-flex">
                  <div className="ProgressBar w-[610px] h-3 relative rounded-2xl">
                    <div className="Bgd w-[610px] h-3 left-0 top-0 absolute bg-violet-100 rounded-2xl" />
                    <div className="Fill w-[610px] h-3 left-0 top-0 absolute bg-lime-600 rounded-2xl" />
                    <div className="Fill w-[372px] h-3 left-0 top-0 absolute bg-orange-500 rounded-2xl" />
                    <div className="Fill w-[208.42px] h-3 left-0 top-0 absolute bg-blue-800 rounded-2xl" />
                  </div>
                  <div className=" text-center text-slate-950 text-[16px] font-bold leading-relaxed">100%</div>
                </div>
              </div>
              <div className="Button w-[221px] px-6 py-4 rounded-[50px] border border-blue-700 justify-center items-center gap-2 flex">
                <div className="Primary text-center text-blue-700 text-[13px] font-semibold uppercase leading-none tracking-widest">enhance sector</div>
                <MdArrowForward size={24} className="text-blue-700" />
              </div>mdtrash
            </div>
          </div>
        </div>
      </div>
      <div className="Frame27147 left-[175px] top-[1995px] absolute flex-col justify-start items-start gap-12 inline-flex">
        <div className="Frame26976 h-9 flex-col justify-start items-start gap-4 flex">
          <div className="Frame26973 self-stretch justify-start items-center gap-6 inline-flex">
            <div className="DownloadDataAs grow shrink basis-0 text-slate-950 text-[28px] font-semibold leading-9">Download Data As</div>
          </div>
        </div>
        <div className="Cards h-[236px] flex-col justify-start items-start gap-6 flex">
          <div className="Frame27052 w-[1090px] justify-start items-start gap-6 inline-flex">
            <div className="Datasourcecard grow shrink basis-0 self-stretch p-6 bg-white rounded-lg shadow flex-col justify-start items-center gap-6 inline-flex">
              <div className="Frame27050 self-stretch h-[188px] flex-col justify-start items-start gap-6 flex">
                <div className="Frame9 self-stretch justify-start items-center gap-2 inline-flex">
                  <div className="Icons w-8 h-8 justify-center items-center flex">
                    <FiDownload size={32} className="text-blue-700" />
                  </div>
                  <div className="CityStatus grow shrink basis-0 text-black text-[22px] font-semibold leading-7">GPC Format</div>
                </div>
                <div className="DownloadYourEmissionInventoryInGpcCompliantFormatToShareWithRelevantStakeholders self-stretch text-black text-[14px] font-normal leading-tight tracking-wide">Download your emission inventory in GPC compliant format to share with relevant stakeholders</div>
                <div className="Button self-stretch h-12 px-6 py-4 bg-blue-700 rounded-[50px] justify-center items-center gap-2 inline-flex">
                  <div className="Icons w-6 h-6 justify-center items-center flex">
                    <div className="IconsFileDownload w-6 h-6 relative flex-col justify-start items-start flex">
                      <FiDownload size={24} className="text-white" />
                    </div>
                  </div>
                  <div className="Primary text-center text-white text-[14px] font-semibold uppercase leading-none tracking-widest">Download</div>
                </div>
              </div>
            </div>
            <div className="DatasourceCard grow shrink basis-0 self-stretch p-6 bg-white rounded-lg shadow flex-col justify-start items-center gap-4 inline-flex">
              <div className="Frame27050 self-stretch h-[188px] flex-col justify-start items-start gap-6 flex">
                <div className="Frame9 self-stretch justify-start items-center gap-2 inline-flex">
                  <div className="Icons w-8 h-8 justify-center items-center flex">
                    <FiDownload size={32} className="text-blue-700" />
                  </div>
                  <div className="CityStatus grow shrink basis-0 text-black text-[22px] font-semibold leading-7">Raw CSV</div>
                </div>
                <div className="DownloadData self-stretch text-black text-[14px] font-normal leading-tight tracking-wide">Download your climate data in raw CSV format to use in your own calculations, processing and presentations</div>
                <div className="Button self-stretch h-12 px-6 py-4 bg-blue-700 rounded-[50px] justify-center items-center gap-2 inline-flex">
                  <div className="Icons w-6 h-6 justify-center items-center flex">
                    <FiDownload size={24} className="text-white" />
                  </div>
                  <div className="Primary text-center text-white text-[14px] font-semibold uppercase leading-none tracking-widest">Download</div>
                </div>
              </div>
            </div>
            <div className="Datasourcecard grow shrink basis-0 p-6 bg-white rounded-lg shadow flex-col justify-start items-center gap-4 inline-flex">
              <div className="Frame27050 self-stretch h-[188px] flex-col justify-start items-start gap-6 flex">
                <div className="Frame9 self-stretch justify-start items-center gap-2 inline-flex">
                  <div className="Icons w-8 h-8 justify-center items-center flex">
                    <FiDownload size={32} className="text-blue-700" />
                  </div>
                  <div className="CityStatus grow shrink basis-0 text-black text-[22px] font-semibold leading-7">CDP Format</div>
                </div>
                <div className="DownloadYourEmissionInventoryAndClimatePlansInCdpCompliantFormatToShareWithRelevantStakeholders self-stretch text-black text-[14px] font-normal leading-tight tracking-wide">Download your emission inventory and climate plans in CDP compliant format to share with relevant stakeholders</div>
                <div className="Button self-stretch h-12 px-6 py-4 bg-blue-700 rounded-[50px] justify-center items-center gap-2 inline-flex">
                  <div className="Icons w-6 h-6 justify-center items-center flex">
                    <FiDownload size={24} className="text-white" />
                  </div>
                  <div className="Primary text-center text-white text-[14px] font-semibold uppercase leading-none tracking-widest">Download</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

