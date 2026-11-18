FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /service
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --create-home --uid 10001 extractor
COPY extractor ./extractor
COPY benchmarks ./benchmarks
RUN mkdir -p /service/.data && chown extractor:extractor /service/.data
USER extractor
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=3)"
CMD ["python", "-m", "uvicorn", "extractor.api:create_app", "--factory", "--host", "0.0.0.0", "--port", "8080"]
