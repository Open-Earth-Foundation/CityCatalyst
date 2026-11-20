# Sandbox image for the CRVA extraction agent (OpenAI Agents SDK DockerSandboxClient).
# The SDK needs /bin/sh, GNU tar and coreutils (realpath) in the image; python:3.12-slim has them.
FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        tesseract-ocr tesseract-ocr-eng tesseract-ocr-spa poppler-utils \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir "pymupdf==1.24.*"
