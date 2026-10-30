# syntax=docker/dockerfile:1.7
#
# The solver: Python, FastAPI and OR-Tools, non-root, nothing else. The
# packages are pinned in pyproject.toml and locked with hashes in uv.lock;
# a build stage exports the lock to a requirements file, and pip installs
# that with --require-hashes, refusing anything the lock does not name. uv
# itself never reaches the runtime image. Build arguments APP_VERSION and
# GIT_SHA record what was built, as for the app.

FROM ghcr.io/astral-sh/uv:0.13.6@sha256:af22a52f5eafef3d78e551599d405c02df61919d18028f0cea8eda93bc9986d0 AS uv

FROM docker.io/library/python:3.13-slim@sha256:d3449c0493345868b09708d7056dce5edda3a75233ea86008fc80c934d355a10 AS requirements
WORKDIR /lock
COPY --from=uv /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock ./
# --frozen: the lock as committed, no resolution, no network.
RUN uv export --frozen --no-dev --no-emit-project --format requirements-txt -o requirements.txt

FROM docker.io/library/python:3.13-slim@sha256:d3449c0493345868b09708d7056dce5edda3a75233ea86008fc80c934d355a10
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Non-root, with a fixed numeric id (the app's is 10001).
RUN groupadd -r -g 10002 solver && useradd -r -u 10002 -g solver solver

COPY --from=requirements /lock/requirements.txt ./
RUN pip install --require-hashes --no-deps -r requirements.txt

COPY app ./app

ARG APP_VERSION=""
ARG GIT_SHA=""
ENV APP_VERSION=${APP_VERSION} GIT_SHA=${GIT_SHA}

USER 10002:10002

EXPOSE 8000
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-server-header"]
