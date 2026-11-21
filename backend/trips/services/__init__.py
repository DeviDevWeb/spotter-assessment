# Trip planning pipeline, orchestrated by planner.plan_trip:
# geocoding -> routing -> checkpoints -> weather -> risk -> recommendation
#
# Providers (no API keys): Nominatim for geocoding, OSRM for routing, Open-Meteo for weather
