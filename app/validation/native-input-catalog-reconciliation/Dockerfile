FROM node:22-alpine

WORKDIR /workspace

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .

