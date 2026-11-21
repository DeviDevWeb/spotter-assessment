from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

# A few hours in the past is still accepted. Departures are limited to the next 48 hours, the
# range the planned forecast heatmap will cover
MAX_PAST_DEPARTURE = timedelta(hours=6)
MAX_FUTURE_DEPARTURE = timedelta(hours=48)


# Trip planning form - POST /api/trips/plan/
# origin / destination accept an address or "lat, lon". The optional *_name is the label of
# coordinates picked from the suggestion list
class TripRequestSerializer(serializers.Serializer):
    origin = serializers.CharField(max_length=200)
    destination = serializers.CharField(max_length=200)
    origin_name = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
    destination_name = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
    departure = serializers.DateTimeField()
    load_weight_lb = serializers.IntegerField(min_value=0, max_value=200_000)

    def validate_departure(self, value):
        now = timezone.now()
        if value < now - MAX_PAST_DEPARTURE:
            raise serializers.ValidationError('Departure can not be in the past')
        if value > now + MAX_FUTURE_DEPARTURE:
            raise serializers.ValidationError('Departure must be within the next 48 hours')
        return value
