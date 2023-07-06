import React from 'react';

export const Header = () => (
  <div className="TopBar w-[1440px] h-[84px] left-0 top-0 absolute justify-center items-center inline-flex">
    <div className="TopBar w-[1440px] h-[84px] px-16 py-6 bg-blue-800 justify-between items-center gap-[610px] inline-flex">
      <div className="Left justify-start items-center gap-14 flex">
        <div className="LogoOe justify-start items-center gap-1.5 flex" />
        <div className="LogoOc w-36 justify-start items-center gap-1.5 flex">
          <div className="Frame27146 w-36 h-8 justify-center items-center gap-2.5 flex">
            <div className="Citycatalyst text-center text-white text-[18px] font-semibold leading-normal tracking-wide">CityCatalyst</div>
          </div>
        </div>
      </div>
      <div className="Right justify-end items-center gap-12 flex">
        <div className="Explore justify-start items-start gap-2.5 flex">
          <div className="Dashboard text-white text-[16px] font-semibold leading-normal">Dashboard</div>
        </div>
        <div className="Explore opacity-60 justify-start items-start gap-2.5 flex">
          <div className="CityStatus text-white text-[16px] font-semibold leading-normal">City Status</div>
        </div>
        <div className="Explore opacity-60 justify-start items-start gap-2.5 flex">
          <div className="Learning text-white text-[16px] font-semibold leading-normal">Learning</div>
        </div>
        <div className="Explore opacity-60 justify-start items-start gap-2.5 flex">
          <div className="AboutUs text-white text-[16px] font-semibold leading-normal">About Us</div>
        </div>
        <div className="Avatar justify-start items-center gap-2 flex">
          <div className="Flag w-6 h-6 relative rounded-[100px]">
            <div className="Group w-[23.59px] h-[21.39px] left-[0.41px] top-[2.61px] absolute">
            </div>
          </div>
          <div className="En text-white text-[14px] font-medium leading-tight tracking-wide">EN</div>
          <div className="Icons w-6 h-6 justify-center items-center flex">
            <div className="IconsArrowDropDown24px w-6 h-6 relative flex-col justify-start items-start flex" />
          </div>
        </div>
        <div className="Avatar justify-start items-center gap-4 flex">
          <div className="Group26975 w-8 h-8 relative">
            <div className="Ellipse w-8 h-8 left-0 top-0 absolute bg-amber-500 rounded-full" />
            <div className="J w-[14.22px] h-[14.22px] left-[8.89px] top-[8.89px] absolute text-center text-white text-[14px] font-medium leading-tight tracking-wide">J</div>
          </div>
          <div className="JaneDoe text-white text-[14px] font-medium leading-tight tracking-wide">Jane Doe</div>
        </div>
      </div>
    </div>
  </div>
);

