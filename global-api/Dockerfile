FROM python:3.11

RUN apt-get update && \
    apt-get install -y postgresql-client gdal-bin libgdal-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /opt/app

COPY ./requirements.txt /opt/app/requirements.txt

RUN pip install --upgrade pip setuptools wheel

RUN pip install --no-cache-dir --upgrade -r /opt/app/requirements.txt

COPY . /opt/app

CMD ["python", "/opt/app/main.py"]
