from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import TripRequestSerializer
from .services.errors import PlanningError
from .services.planner import plan_trip


# Liveness check, public - API endpoint
@api_view(['GET'])
@permission_classes([AllowAny])
def health(_request: Request) -> Response:
    return Response({'status': 'ok'})


# Plan a trip: 3 scored routes, the recommended one and the 0-48h corridor heatmap - API endpoint
# Pipeline (trips/services): geocoding -> routing -> checkpoints -> weather -> risk -> recommendation
class PlanTripView(APIView):
    def post(self, request: Request) -> Response:
        serializer = TripRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            return Response(plan_trip(serializer.validated_data))
        except PlanningError as error:
            return Response({'detail': error.message}, status=error.status_code)
