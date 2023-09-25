FROM python:3.11

WORKDIR /opt/app

COPY ./requirements.txt /opt/app/requirements.txt

RUN pip install --no-cache-dir --upgrade -r /opt/app/requirements.txt

COPY . /opt/app

CMD ["python", "/opt/app/main.py"]
