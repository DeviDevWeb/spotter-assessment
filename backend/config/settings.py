import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env')


def env_list(name: str, default: str = '') -> list[str]:
    return [v.strip() for v in os.getenv(name, default).split(',') if v.strip()]


########################################
###############Django###################
########################################

SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', 'dev-insecure-key')
DEBUG = os.getenv('DJANGO_DEBUG', 'False').lower() == 'true'
ALLOWED_HOSTS = env_list('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1')

INSTALLED_APPS = [
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'corsheaders',
    'rest_framework',
    'rest_framework.authtoken',
    'accounts',
    'trips',
]

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 8}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
]

ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'

# Postgres when POSTGRES_DB is set (docker compose), sqlite otherwise for quick local runs
if os.getenv('POSTGRES_DB'):
    DATABASES: dict[str, dict] = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.getenv('POSTGRES_DB'),
            'USER': os.getenv('POSTGRES_USER', 'postgres'),
            'PASSWORD': os.getenv('POSTGRES_PASSWORD', ''),
            'HOST': os.getenv('POSTGRES_HOST', 'localhost'),
            'PORT': os.getenv('POSTGRES_PORT', '5432'),
            'CONN_MAX_AGE': 60,
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

# In-process cache for geocoding results and forecasts. Gunicorn runs a single worker process
# (with threads) so every request sees the same cache
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'TIMEOUT': 60 * 30,
    }
}

TEMPLATES: list[dict] = []

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_TZ = True

# Warnings from the trips app (failed third-party calls) go to the console / docker logs
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {'console': {'class': 'logging.StreamHandler'}},
    'loggers': {'trips': {'handlers': ['console'], 'level': 'INFO'}},
}

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

########################################
#############REST / CORS################
########################################

# JSON only. Every endpoint needs a logged in user ("Authorization: Token <key>") unless it
# says otherwise
REST_FRAMEWORK = {
    'DEFAULT_RENDERER_CLASSES': ['rest_framework.renderers.JSONRenderer'],
    'DEFAULT_PARSER_CLASSES': ['rest_framework.parsers.JSONParser'],
    'DEFAULT_AUTHENTICATION_CLASSES': ['rest_framework.authentication.TokenAuthentication'],
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
}

CORS_ALLOWED_ORIGINS = env_list('CORS_ALLOWED_ORIGINS', 'http://localhost:5173')

# The browser posts the trip's hourly forecasts back (up to a few MB on long trips), Django's
# default limit is 2.5 MB
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024

########################################
###########Third-party APIs#############
########################################

# All keyless public services. Their usage policies ask for an identifying User-Agent. Weather
# (Open-Meteo) is fetched by the browser, see trips/services/weather.py
OSRM_BASE_URL = os.getenv('OSRM_BASE_URL', 'https://router.project-osrm.org')
NOMINATIM_BASE_URL = os.getenv('NOMINATIM_BASE_URL', 'https://nominatim.openstreetmap.org')
HTTP_USER_AGENT = os.getenv('HTTP_USER_AGENT', 'weather-aware-truck-routing/0.1')
UPSTREAM_TIMEOUT_SECONDS = 20
