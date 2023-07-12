import React from 'react';

export const Footer = () => (
  <div className="Footer h-80 px-16 pt-12 pb-20 left-0 top-[2435px] absolute bg-slate-950 flex-col justify-start items-start gap-12 inline-flex w-full">
    <div className="Links self-stretch justify-start items-start gap-[100px] inline-flex">
      <div className="LogoOc w-36 justify-start items-center gap-1.5 flex">
        <div className="LogoOc w-36 justify-start items-center gap-1.5 flex">
          <div className="Frame27146 w-36 h-8 justify-center items-center gap-2.5 flex">
            <div className="Citycatalyst text-center text-white text-[18px] font-semibold leading-normal tracking-wide">CityCatalyst</div>
          </div>
        </div>
      </div>
      <div className="Links grow shrink basis-0 h-16 justify-start items-start gap-12 flex">
        <div className="List grow shrink basis-0 flex-col justify-start items-start gap-6 inline-flex">
          <div className="AboutOpenClimate text-white text-[14px] font-medium leading-tight tracking-wide">About Open Climate</div>
          <div className="Cad20Community text-white text-[14px] font-medium leading-tight tracking-wide">CAD2.0 Community</div>
        </div>
        <div className="List grow shrink basis-0 flex-col justify-start items-start gap-6 inline-flex">
          <div className="ContributionGuide text-white text-[14px] font-medium leading-tight tracking-wide">Contribution Guide</div>
          <div className="ReadTheDocs text-white text-[14px] font-medium leading-tight tracking-wide">Read the Docs</div>
        </div>
        <div className="List grow shrink basis-0 flex-col justify-start items-start gap-6 inline-flex">
          <div className="GoToGithub text-white text-[14px] font-medium leading-tight tracking-wide">Go to GitHub</div>
          <div className="PythonClientDocs text-white text-[14px] font-medium leading-tight tracking-wide">Python Client Docs</div>
        </div>
      </div>
      <div className="Cta justify-start items-start gap-6 flex">
        <div className="Button w-[150px] px-6 py-4 bg-blue-700 rounded-[50px] justify-center items-center gap-2 flex">
          <div className="Primary text-center text-white text-[13px] font-semibold uppercase leading-none tracking-widest">
            <a href="mailto://info@openearth.org">Contact us</a>
          </div>
        </div>
      </div>
    </div>
    <div className="Info self-stretch justify-start items-center gap-4 inline-flex border-t-2 border-[#232640] pt-12">
      <div className="Feedback grow shrink basis-0 h-5 justify-start items-center gap-4 flex">
        <div className="BetaTag px-4 py-0.5 bg-violet-200 rounded-xl justify-start items-start gap-2.5 flex">
          <div className="Beta text-slate-950 text-[11px] font-medium leading-none tracking-wide m-0.5">BETA</div>
        </div>
        <div className="ThisSiteIsABetaVersionWeAppreciateAllFeedbackToImproveThePlatform text-white text-[14px] font-normal leading-tight tracking-wide">This site is a beta version, we appreciate all feedback to improve the platform</div>
        <div className="SendFeedback text-right text-white text-[14px] font-medium underline leading-tight tracking-wide">
          <a href="mailto://info@openearth.org">Send Feedback</a>
        </div>
      </div>
      <div className="PoweredBy justify-start items-center gap-2 flex">
        <div className="Group w-[142.74px] h-8 relative">
        </div>
      </div>
    </div>
  </div>
);

