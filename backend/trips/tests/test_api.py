from datetime import timedelta

import pytest
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


def test_health_is_public():
    response = APIClient().get('/api/health/')
    assert response.status_code == 200
    assert response.json() == {'status': 'ok'}


def test_plan_trip_requires_login():
    response = APIClient().post('/api/trips/plan/', {}, format='json')
    assert response.status_code == 401


def test_plan_trip_validates_input():
    client = APIClient()
    client.force_authenticate(User.objects.create_user('driver', password='long-enough-1'))
    response = client.post('/api/trips/plan/', {}, format='json')
    assert response.status_code == 400


# The heatmap covers 48 hours from departure, so later departures are refused
def test_departure_more_than_48_hours_ahead_is_rejected():
    client = APIClient()
    client.force_authenticate(User.objects.create_user('driver', password='long-enough-1'))
    departure = (timezone.now() + timedelta(hours=49)).isoformat()
    body = {'origin': 'Dallas, TX', 'destination': 'Chicago, IL', 'departure': departure, 'load_weight_lb': 1000}
    response = client.post('/api/trips/plan/', body, format='json')
    assert response.status_code == 400
    assert response.json() == {'departure': ['Departure must be within the next 48 hours']}
