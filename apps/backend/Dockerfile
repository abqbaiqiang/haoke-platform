FROM python:3.14-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app/apps/backend
WORKDIR /app
COPY apps/backend/requirements.lock /app/requirements.lock
RUN pip install --no-cache-dir -r requirements.lock && useradd --uid 10001 --create-home appuser
COPY apps/backend /app/apps/backend
COPY apps/worker /app/apps/worker
USER appuser
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log", "--no-proxy-headers"]

FROM runtime AS test
USER root
COPY requirements-test.lock /app/requirements-test.lock
RUN pip install --no-cache-dir -r requirements-test.lock
COPY tests /app/tests
COPY pyproject.toml docker-compose.yml /app/
COPY scripts /app/scripts
COPY apps/frontend/package.json apps/frontend/package-lock.json /app/apps/frontend/
COPY apps/frontend/app /app/apps/frontend/app
COPY .env.example /app/.env.example
USER appuser
CMD ["python", "-m", "pytest", "-q", "-p", "no:cacheprovider"]
