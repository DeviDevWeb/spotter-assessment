from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response

from .serializers import LoginSerializer, RegisterSerializer, UserSerializer


# Token and user returned by register and login.
def _session(user) -> dict:
    token, _ = Token.objects.get_or_create(user=user)
    return {'token': token.key, 'user': UserSerializer(user).data}


# Create an account and log in right away - API endpoint
@api_view(['POST'])
@permission_classes([AllowAny])
def register(request: Request) -> Response:
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    return Response(_session(user), status=status.HTTP_201_CREATED)


# Exchange username/password for a token - API endpoint
@api_view(['POST'])
@permission_classes([AllowAny])
def login(request: Request) -> Response:
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    return Response(_session(serializer.validated_data['user']))


# Delete the token, logging out on every device using it - API endpoint
@api_view(['POST'])
def logout(request: Request) -> Response:
    Token.objects.filter(user=request.user).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# Who the token belongs to, used to check a stored session is still valid - API endpoint
@api_view(['GET'])
def me(request: Request) -> Response:
    return Response(UserSerializer(request.user).data)
