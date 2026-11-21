import logging
from typing import Any
from urllib.parse import urlparse

import requests
from django.conf import settings

from .errors import UpstreamError

logger = logging.getLogger(__name__)

# One shared session so connections to each provider are reused
_session = requests.Session()
_session.headers['User-Agent'] = settings.HTTP_USER_AGENT


def _host(url: str) -> str:
    return urlparse(url).netloc


# GET returning parsed JSON. 4xx bodies are returned so callers can read the provider's own error.
# Every failure is logged with its cause, the user only gets the short message
def get_json(url: str, params: dict | None = None) -> Any:
    host = _host(url)
    try:
        response = _session.get(url, params=params, timeout=settings.UPSTREAM_TIMEOUT_SECONDS)
    except requests.RequestException as exc:
        logger.warning('Request to %s failed: %r', host, exc)
        raise UpstreamError(f'Could not reach {host}, try again in a moment') from exc

    if response.status_code == 429:
        logger.warning('Rate limited by %s: %s', host, response.text[:300])
        raise UpstreamError(f'{host} is rate limiting requests, try again in a minute')
    if response.status_code >= 500:
        logger.warning('%s returned %s: %s', host, response.status_code, response.text[:300])
        raise UpstreamError(f'{host} returned an error ({response.status_code})')

    try:
        return response.json()
    except ValueError as exc:
        logger.warning('Non-JSON response from %s (%s): %s', host, response.status_code, response.text[:300])
        raise UpstreamError(f'Invalid response from {host}') from exc
