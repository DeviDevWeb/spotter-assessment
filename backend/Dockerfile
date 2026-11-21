FROM python:3.12-slim

# No .pyc files, unbuffered logs so output shows up in `docker compose logs`
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependencies first so code changes don't invalidate this layer
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Run as non-root
RUN useradd --create-home appuser && chown -R appuser /app
USER appuser

EXPOSE 8000

# Apply migrations, then serve with gunicorn. One process with threads (requests mostly wait on
# third-party APIs) so the in-memory cache is shared by every request
CMD ["sh", "-c", "python manage.py migrate --noinput && gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 1 --threads 8 --timeout 90 --access-logfile -"]
