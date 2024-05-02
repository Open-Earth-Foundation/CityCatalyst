FROM mageai/mageai:latest

ARG PROJECT_NAME=cc-mage
ARG MAGE_CODE_PATH=/home/src
ARG USER_CODE_PATH=${MAGE_CODE_PATH}/${PROJECT_NAME}

WORKDIR ${MAGE_CODE_PATH}

COPY cc-mage cc-mage
COPY raw_data raw_data

# Set up for GDAL and netcdf
# RUN apt-get update && \
#     apt-get install -y build-essential python3-dev python3-pip \
#                        libgdal-dev libproj-dev proj-bin \
#                        libhdf5-dev libnetcdf-dev

# Set environment variables
ENV CPLUS_INCLUDE_PATH=/usr/include/gdal
ENV C_INCLUDE_PATH=/usr/include/gdal

ENV USER_CODE_PATH=${USER_CODE_PATH}

RUN pip3 install -r ${USER_CODE_PATH}/requirements.txt

ENV PYTHONPATH="${PYTHONPATH}:/home/mage_code"

CMD ["/bin/sh", "-c", "/app/run_app.sh"]