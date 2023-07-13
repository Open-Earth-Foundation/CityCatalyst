import React from 'react';
import { Poppins } from 'next/font/google';
import { MdAddchart, MdArrowForward, MdBarChart, MdOutlineAnalytics, MdArrowOutward, MdOutlinePeopleAlt, MdAspectRatio, MdOutlineHomeWork, MdInfoOutline } from 'react-icons/md';
import { FaFileExport } from 'react-icons/fa';
import { PiNotePencil, PiTrashLight } from 'react-icons/pi';
import { BsTruck } from 'react-icons/bs';
import { FiDownload } from 'react-icons/fi';
import { Button } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { SizeType } from 'antd/es/config-provider/SizeContext';

// import { Header } from "./Header";
// import { Footer } from "./Footer";

const poppins = Poppins({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-poppins',
});

export function Page() {
  return (
    <div className={`${poppins.className}`}>
      Hello
      <Button type="primary" shape="round" icon={<DownloadOutlined />}>
        Download
      </Button>
    </div>
  );
}
