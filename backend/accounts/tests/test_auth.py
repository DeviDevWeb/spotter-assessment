import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db

PASSWORD = 'trucks-in-the-rain'


def register(client: APIClient, username='driver', password=PASSWORD):
    return client.post('/api/auth/register/', {'username': username, 'password': password}, format='json')


def test_register_returns_a_working_token():
    client = APIClient()
    response = register(client)
    assert response.status_code == 201
    assert response.json()['user']['username'] == 'driver'

    client.credentials(HTTP_AUTHORIZATION=f'Token {response.json()["token"]}')
    assert client.get('/api/auth/me/').json()['username'] == 'driver'


def test_register_rejects_weak_password_and_taken_username():
    client = APIClient()
    weak = register(client, password='12345678')
    assert weak.status_code == 400
    assert 'password' in weak.json()
    assert register(client).status_code == 201
    response = register(client, username='DRIVER')
    assert response.status_code == 400
    assert 'username' in response.json()


def test_login_and_logout():
    client = APIClient()
    register(client)

    assert client.post('/api/auth/login/', {'username': 'driver', 'password': 'wrong'}, format='json').status_code == 400
    response = client.post('/api/auth/login/', {'username': 'driver', 'password': PASSWORD}, format='json')
    assert response.status_code == 200

    client.credentials(HTTP_AUTHORIZATION=f'Token {response.json()["token"]}')
    assert client.post('/api/auth/logout/').status_code == 204
    assert client.get('/api/auth/me/').status_code == 401

