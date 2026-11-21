from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import TripForecastsSerializer, TripRequestSerializer
from .services.errors import PlanningError
from .services.planner import finish_trip, prepare_trip


# Liveness check, public - API endpoint
@api_view(['GET'])
@permission_classes([AllowAny])
def health(_request: Request) -> Response:
    return Response({'status': 'ok'})


# Plan a trip, first half: routes and checkpoints, plus the forecasts the browser has to fetch - API endpoint
# Pipeline (trips/services): geocoding -> routing -> checkpoints | browser fetches weather | risk -> recommendation
class PlanTripView(APIView):
    def post(self, request: Request) -> Response:
        serializer = TripRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            return Response(prepare_trip(serializer.validated_data, request.user.id))
        except PlanningError as error:
            return Response({'detail': error.message}, status=error.status_code)


# Plan a trip, second half: 3 scored routes, the recommended one and the 0-48h corridor heatmap - API endpoint
class PlanWeatherView(APIView):
    def post(self, request: Request, plan_id: str) -> Response:
        serializer = TripForecastsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            return Response(finish_trip(plan_id, request.user.id, serializer.validated_data['forecasts']))
        except PlanningError as error:
            return Response({'detail': error.message}, status=error.status_code)
