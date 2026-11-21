from django.urls import path

from . import views

urlpatterns = [
    path('health/', views.health, name='health'),
    path('trips/plan/', views.PlanTripView.as_view(), name='plan-trip'),
    path('trips/plan/<slug:plan_id>/weather/', views.PlanWeatherView.as_view(), name='plan-weather'),
]
