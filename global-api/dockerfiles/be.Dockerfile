FROM python:3.10.11

ARG build_env=prod

ENV CURRENT_ENVIRONMENT $build_env

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

RUN mkdir /code
WORKDIR /code

RUN apt update

# Installting project level python dependencies
RUN pip install --upgrade pip
RUN pip install poetry
RUN poetry config virtualenvs.create false
COPY ./pyproject.toml /code/
RUN poetry install
