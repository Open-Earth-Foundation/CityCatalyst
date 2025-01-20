FROM mageai/mageai:latest

ARG PROJECT_NAME=cc-mage
ARG MAGE_CODE_PATH=/home/src
ARG USER_CODE_PATH=${MAGE_CODE_PATH}/${PROJECT_NAME}

WORKDIR ${MAGE_CODE_PATH}

COPY ${PROJECT_NAME} ${PROJECT_NAME}

ENV USER_CODE_PATH=${USER_CODE_PATH}

# Commenting out the requirements installation step
#RUN pip3 install -r ${USER_CODE_PATH}/requirements.txt

ENV PYTHONPATH="${PYTHONPATH}:${MAGE_CODE_PATH}"

CMD ["/bin/sh", "-c", "/app/run_app.sh"]
