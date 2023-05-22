# CityCatalyst Architecture

Evan Prodromou

19 May 2023

This document describes the components of the [CityCatalyst UML diagram](./CityCatalyst Components.svg).


# CityCatalyst Server

This is a Web API server, implemented in NodeJS. It should be deployable with Kubernetes. Can be deployed on the client network or in a cloud service. Assumed one installation per city. Can use Global Services (see below), or work independently without extended services.



* **CityCatalyst API service**: main entrypoint to the server. A RESTful API, using Express for routing. Uses OAuth 2.0 for authentication and authorization.
* **Workflow Engine**: A component that represents the project of building an inventory – collecting and assembling data, submitting data, etc.
* **Inventory Storage**: A component that represents storing annual GHG Inventory data. Implemented in PostgreSQL.
* **Data Source Catalog**: A catalog of data sources, including how to fetch data from them, whether payment is required, and how to transform data after it’s fetched.
* **Auth**. A service for authentication and authorization. Can use a third-party authentication service like LDAP or only an internal system.
* **Data Transformation Service**. Responsible for transforming returned data into the necessary components of an Inventory.
* **API Client**. Efficiently fetches and stores data from third-party services or the CityCatalyst global services.
* **Inventory Submission Service**. Submits completed GPC inventories to CDP, OpenClimate, and other services.


# CityCatalyst Web Client

A Web-based client application. Written in JavaScript. Client-side only; can be deployed on a Web server, CDN, or through Kubernetes.



* **CityCatalyst API Client**: dedicated component for interacting with the API server. Manages OAuth keys and caching.
* **Inventory Model**: A model of a GHG inventory. Uses the API client to create/read/update/delete.
* **Workflow Model**: A model of a workflow (tasks, what next). Uses the API client.
* **User Model**: A model of the current user, including settings and preferences. Uses the API client.
* **UI Framework**: A structure for defining the UI. ReactJS.
* **UI Component Library**: A component library for the UI. ReactJS-Bootstrap.
* **I18n. **Framework for supporting multiple languages. [https://react.i18next.com/](https://react.i18next.com/) 
* **State management**. Maintaining state on the client side. Redux or TBD.


# CityCatalyst Admin

A catch-all component for managing the CityCatalyst Server.



* **Administrative Tools**. A set of command-line tools for managing the CityCatalyst server. Can have direct administrative access to data stores, running processes, or other internal systems.


# CityCatalyst Global Services

A set of APIs and remote services for CityCatalyst implementations. Optionally provided for the CityCatalyst server software; not required for CityCatalyst to work.



* **DataSource Catalog Sync**. A service for updating the data source catalog over time. Could be versioned releases of a catalog file in JSON format, stored on a Web-accessible drive.
* **Third-Party Data Set Proxy API**. Third-party datasets (see below) can be large and unwieldy, with thousands or millions of rows of data. For any particular city, only a small subset of the dataset will be applicable, so it’s unreasonable to download the entire file. This proxy API will allow selecting applicable rows from a data set, without getting the entire file. Implemented as a REST API in NodeJS and express.
* **Data Payment Service.** Some data will require payment for access. This service will accept payment, and return access tokens for the Third-Party Data Set Proxy API or for the Third Party Data API (see below). It will also provide invoice data. Probably a third-party service like Stripe for payment, and a REST API in NodeJS and express for the token management.
* **Data Harmonization API. **An API that accepts a dataset’s column names, column descriptions, and sample rows of data, and returns a technique for transforming that dataset into the format needed for a GPC inventory. Uses an LLM for the heavy lifting. REST interface implemented in NodeJS and express, with the openai-node library for OpenAI access.


# Third-Party Services

An abstract node, standing in for the dozens of third-party systems that will provide global data for calculating a GPC inventory.



* **Third-Party Data API**: Any API that can return a subset of the required data through a REST interface, preferably with an OAuth 2.0 or other API token mechanism.
* **Third-Party Datasets**: Any data provided as downloadable files, such as CSV, XML or JSON. These will be proxied through the Third-Party Data Set Proxy API (see above).


# Enterprise Network

Abstract node, standing in for an enterprise system provided by the city.



* **Enterprise Login Service**. An abstract node, representing the enterprise login service. LDAP interface is the most reasonable here, although it may also make sense to support services like Google Apps for Organizations.


# OpenClimate

The OpenClimate data utility at [https://openclimate.network/](https://openclimate.network/) .



* **OpenClimate API. **The REST API for OpenClimate. Provides two main services: 1) fetching existing emissions data for cities, either for comparison with other cities, or for historical data; 2) submitting a completed GPC inventory. Implemented in NodeJS with express.


# LLM Provider

An abstract representation of a large-language model (LLM) provider. Current front-runner is OpenAI.



* **LLM API**. A RESTful API for making requests and retrieving results from a large language model. The OpenAI API is the current lead candidate here.
