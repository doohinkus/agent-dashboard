# syntax=docker/dockerfile:1
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

# Install dependencies first so this layer stays cached when only app.py changes.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

COPY app.py README.md ./
# Second sync installs the project itself (generates the agent-dashboard script);
# README.md is needed because the project metadata embeds it.
RUN uv sync --frozen --no-dev

ENV PATH="/app/.venv/bin:$PATH" \
    HOST=0.0.0.0

# Run unprivileged.
RUN useradd --create-home appuser && chown -R appuser /app
USER appuser

# stdlib-only check — the slim base image ships neither curl nor wget.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8100')+'/health')"

EXPOSE 8100

CMD ["agent-dashboard"]
