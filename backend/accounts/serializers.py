from django.contrib.auth import authenticate, password_validation
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username']


# New account - POST /api/auth/register/
class RegisterSerializer(serializers.Serializer):
    username = serializers.RegexField(
        r'^[\w.@+-]{3,30}$',
        error_messages={'invalid': 'Use 3 to 30 letters, numbers or . @ + - _'},
    )
    password = serializers.CharField(write_only=True, max_length=128, trim_whitespace=False)

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError('That username is taken')
        return value

    # Runs Django's password validators, including similarity to the
    # username, and reports their messages on the password field
    def validate(self, attrs):
        try:
            password_validation.validate_password(attrs['password'], User(username=attrs['username']))
        except DjangoValidationError as error:
            raise serializers.ValidationError({'password': list(error.messages)}) from error
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(username=validated_data['username'], password=validated_data['password'])


# Existing account - POST /api/auth/login/
class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, max_length=128, trim_whitespace=False)

    def validate(self, attrs):
        user = authenticate(username=attrs['username'], password=attrs['password'])
        if user is None:
            raise serializers.ValidationError('Wrong username or password')
        attrs['user'] = user
        return attrs
