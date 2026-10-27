# syntax=docker/dockerfile:1.7
#
# The solver: Python, FastAPI and OR-Tools, non-root, nothing else. Every
# package comes from requirements.txt with its hash; pip refuses anything
# it does not list. Build arguments APP_VERSION and GIT_SHA record what
# was built, as for the app.

FROM docker.io/library/python:3.13-slim@sha256:d3449c0493345868b09708d7056dce5edda3a75233ea86008fc80c934d355a10
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Non-root, with a fixed numeric id (the app's is 10001).
RUN groupadd -r -g 10002 solver && useradd -r -u 10002 -g solver solver

COPY requirements.txt ./
RUN pip install --require-hashes --no-deps -r requirements.txt

COPY app ./app

ARG APP_VERSION=""
ARG GIT_SHA=""
ENV APP_VERSION=${APP_VERSION} GIT_SHA=${GIT_SHA}

USER 10002:10002

EXPOSE 8000
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-server-header"]
