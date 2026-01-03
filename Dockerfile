FROM python:3.13-slim-bookworm

# Install uv from the official image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy the project into the image
WORKDIR /app

# Enable bytecode compilation
ENV UV_COMPILE_BYTECODE=1

# Copy the project definition
COPY pyproject.toml uv.lock ./

# Install the project's dependencies using the lockfile and settings
RUN uv sync --frozen --no-install-project --no-dev

# Copy the project source code
COPY . .

# Place the executables in the environment at the front of the path
ENV PATH="/app/.venv/bin:$PATH"

# Expose the port
EXPOSE 5001

# Run the server
CMD ["python", "server.py"]