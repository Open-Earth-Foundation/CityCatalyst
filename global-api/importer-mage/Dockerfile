FROM mageai/mageai:latest

ARG PROJECT_NAME=cc-mage
ARG MAGE_CODE_PATH=/home/src
ARG USER_CODE_PATH=${MAGE_CODE_PATH}/${PROJECT_NAME}

WORKDIR ${MAGE_CODE_PATH}

COPY ${PROJECT_NAME} ${PROJECT_NAME}

ENV USER_CODE_PATH=${USER_CODE_PATH}

# Uninstall the packages listed in requirements.txt
RUN pip uninstall -y -r ${USER_CODE_PATH}/requirements.txt || true

ENV PYTHONPATH="${PYTHONPATH}:${MAGE_CODE_PATH}"

CMD ["/bin/sh", "-c", "/app/run_app.sh"]
