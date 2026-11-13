FROM python:3.11.9-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir .
COPY alembic.ini ./
COPY migrations ./migrations
# Un solo imagen: api, publisher, worker e init cambian el modulo (command en Compose)
ENTRYPOINT ["python", "-m"]
CMD ["app.entrypoints.api"]
