import React from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";

export function Page() {
  return <>
    <Header />
    <button className="btn btn-primary">Hello Daisy UI!</button>
    <p className="px-8">Test</p>
    <Footer />
  </>;
}

