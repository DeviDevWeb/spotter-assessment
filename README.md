# Weather-Aware Truck Routing

React + Django app that helps a truck driver pick the safest route based on weather along the way, load weight and travel time.

**Stack:** React 18 + TypeScript (Vite), Tailwind CSS v4, MapLibre GL via react-map-gl, Motion for small animations, react-icons (Weather Icons set) · Django 5 + Django REST Framework · Postgres · Docker Compose.

The driver enters an origin, a destination, a departure time and a load weight. The app finds 3 route options, checks the forecast at each checkpoint for the hour the truck will actually be there, classifies the risk, and recommends a route. Everything is shown on a map, with a 0–48 h weather risk heatmap along the corridor.

## Features

- **3 route options** with distance, travel time, Severe / High / No Travel miles and average risk.
- **Recommendation** with a one-line reason, e.g. "No Severe miles, route B has 35".
- **Checkpoints** colored by risk. Click one for its ETA, wind, gusts, rain and snow; each value that raises the risk is colored by its own level.
- **Heatmap + slider**: weather risk around the routes, hour by hour from departure to +48 h. A truck marker shows where the truck is at that hour. The slider marks the selected route's arrival; hours after it are striped and the truck waits at the destination.
- **Places**: type with suggestions (minor typos still match), type an address or `lat, lon`, or click **Select** and pick a spot on the map.
- **Reset** clears the plan and the form, keeping the map where it is.
- **Accounts**: register / log in. Planning requires a logged-in user.

## How it works

```
geocoding → routing → checkpoints → weather → risk → recommendation (+ heatmap)
```

All of it lives in [backend/trips/services/](backend/trips/services/), one module per step, orchestrated by `planner.py`.

| Step           | Provider                      | Notes                                                        |
| -------------- | ------------------------------------------- | ------------------------------------------------------------ |
| Suggestions    | Open-Meteo Geocoding (called by the browser) | Cities and towns. Also lists names within a letter or two of what was typed (same first 3 letters), biggest places first |
| Geocoding      | OpenStreetMap Nominatim                     | Free-text addresses. Max 1 req/s                             |
| Routing        | OSRM public server                          | See "Routes are car routes" below                             |
| Weather        | Open-Meteo hourly forecast                  | Sustained wind, gusts, rain + showers, snowfall               |

### Routes

OSRM returns up to 3 alternatives but often fewer on long trips. The missing ones are built by routing through a point pushed sideways from the trip's midpoint. A candidate is dropped if its distance and time are both within 2% of an existing route (the same road) or it takes more than 1.6× the fastest time. Routes are labeled A, B, C from fastest to slowest.

### Checkpoints

There's one checkpoint at the start, one at the destination, and more in between, spaced by **how far ahead the forecast is at the truck's ETA**:

| Truck arrives (from now) | Spacing |
| ------------------------ | ------- |
| within 12 h              | 10 mi   |
| within 48 h              | 25 mi   |
| later                    | 50 mi   |

Near-term forecasts are the most precise, so that's where sampling is densest. ETAs assume a constant average speed over the route's total duration, and each checkpoint uses the forecast hour closest to its ETA.

### Risk

The spec's thresholds, in [risk.py](backend/trips/services/risk.py):

| Condition | Low       | Moderate  | High      | Severe    | No Travel |
| --------- | --------- | --------- | --------- | --------- | --------- |
| Wind      | < 25 mph  | 25–34     | 35–44     | 45–54     | ≥ 55      |
| Rain      | < 0.10 in/hr | 0.10–0.25 | 0.25–0.50 | 0.50–1.00 | > 1.00 |
| Snow      | < 0.5 in/hr | 0.5–1.0 | 1.0–2.0   | 2.0–3.0   | > 3.0     |

Load rules: 45–54 mph with more than 30,000 lb is No Travel, and 35–44 mph with more than 40,000 lb is Severe. A checkpoint's level is the worst of wind, rain, snow and load.

Decisions where the spec is open:

- **Shared boundaries** (0.25, 0.50…) belong to the higher level, because "< 0.10" is Low so 0.10 is Moderate. The exception is No Travel for rain and snow, which says "> 1.00" / "> 3.0", so exactly 1.00 / 3.0 is still Severe.
- **Gusts and sustained wind both count.** Gusts are always the higher number, so using the same table for both would make sustained wind irrelevant. A gust counts like sustained wind 17 mph lower. The US National Weather Service puts gust criteria 15 mph above sustained for wind advisories (31 / 46 mph) and 18 mph above for high wind warnings (40 / 58 mph); 17 is about the average. Wind thresholds and load rules use `max(sustained, gust − 17)`.
- **Risk miles**: each stretch between two checkpoints counts as the worse of its two ends.

### Recommendation

Routes are ranked by, in order:

1. Fewest **No Travel** miles. Not in the spec's list, but it's worse than Severe, so it goes first.
2. Fewest Severe miles
3. Fewest High miles
4. Lowest average risk (distance-weighted, Low = 0 … No Travel = 4)
5. Shortest travel time

The reason shown is the first criterion where the winner beats the runner-up.

### Heatmap

The heatmap is a grid of cells around the 3 routes. Each cell has the same risk level as a checkpoint would (0 Low … 4 No Travel) for every hour from departure to +48 h. It comes back in the same response as the routes. The browser blends neighboring cells into a smooth image (soft corridor edges, rows aligned to the map projection) and redraws it when the slider moves.

### Limits and caching

Open-Meteo's free tier allows about 600 location-calls per minute, so each plan is capped:

- Checkpoints snap to a 0.25° grid (~17 mi), and nearby ones share a forecast. Above 250 locations the grid doubles until it fits.
- The heatmap uses 0.5° cells, capped at 200. Coast-to-coast trips end up with a coarser grid, about 2°.
- Checkpoints and heatmap request the same forecast window, so they share cache entries (30 min).
- The cache lives in memory, so gunicorn runs one process with 8 threads and every request sees the same cache. Requests mostly wait on the third-party APIs, so threads are enough.

A paid Open-Meteo key would lift these caps and allow finer grids.

## Routes are car routes

There's no free, keyless routing API that gives truck routes with alternatives across long distances:

- **OSRM's public server** (used here) only has a car profile.
- **OpenRouteService** has a truck (`driving-hgv`) profile, but only returns alternative routes for trips up to about 100 km.
- **GraphHopper, HERE, TomTom** and similar services have truck routing behind API keys and paid tiers.

So, in this app:

- **Travel times and ETAs are car estimates.** A loaded truck is usually slower, so real ETAs will be somewhat later. Forecast hours may shift by about an hour on long trips.
- **Truck restrictions are not considered**: bridge heights, weight limits, hazmat routes, roads closed to trucks.
- Weather risk, checkpoints, load rules and the recommendation don't depend on the vehicle profile. Only the geometry and timing come from the router.

Swapping in a truck router means changing one function, `get_route_options` in [routing.py](backend/trips/services/routing.py). It returns plain `RouteOption` objects (geometry, distance, duration).

## Running it

### Docker (Postgres + API + frontend)

```bash
cp backend/.env.example backend/.env   # optional, defaults work
docker compose up --build -d
```

| Service  | URL                   |
| -------- | --------------------- |
| App      | http://localhost:8080 |
| API      | http://localhost:8000 |
| Postgres | localhost:5433        |

The backend runs migrations on start. `docker compose down` stops everything, and `down -v` also wipes the database.

### Local development

```bash
# Backend: http://localhost:8000
cd backend
python -m venv .venv
.venv\Scripts\activate             # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt   # app + pytest + ruff
python manage.py migrate
python manage.py runserver

# Frontend: http://localhost:5173, proxies /api to :8000
cd frontend
npm install
npm run dev
```

Without `POSTGRES_DB` the backend uses SQLite. To use the Docker database locally, set the `POSTGRES_*` variables in `backend/.env` with `POSTGRES_PORT=5433`.

### Tests and lint

```bash
cd backend
pytest            # risk thresholds, gusts, load rules, checkpoints, ranking, heatmap, auth
ruff check .      # lint

cd frontend
npm run lint      # ESLint, including the React hooks rules
npm run build     # type-check + production build
```

## API

| Method | Path                  | Auth | Purpose                                           |
| ------ | --------------------- | ---- | ------------------------------------------------- |
| GET    | `/api/health/`        | —    | Liveness check                                    |
| POST   | `/api/auth/register/` | —    | Create an account, returns `{token, user}`        |
| POST   | `/api/auth/login/`    | —    | Returns `{token, user}`                           |
| POST   | `/api/auth/logout/`   | ✓    | Deletes the token                                 |
| GET    | `/api/auth/me/`       | ✓    | Current user                                      |
| POST   | `/api/trips/plan/`    | ✓    | Routes, checkpoints, recommendation and heatmap   |

Authenticated requests send `Authorization: Token <token>`. The plan request body:

```json
{
    "origin": "Dallas, TX",
    "destination": "41.85003, -87.65005",
    "destination_name": "Chicago, Illinois, United States",
    "departure": "2026-11-20T14:00:00Z",
    "load_weight_lb": 42000
}
```

`origin` and `destination` take an address or `lat, lon`. The optional `*_name` labels coordinates the user picked from the suggestions. Coordinates without a name are shown as the numbers. Departure must be within the next 48 hours.

## Project layout

```
backend/
  config/            settings, urls, wsgi
  accounts/          register / login / logout / me (Django users + DRF tokens, stored in Postgres)
  trips/
    domain.py        plain dataclasses shared by the services
    services/        geocoding, routing, checkpoints, weather, risk, recommendation, heatmap, planner
    tests/
frontend/
  src/
    api/client.ts    backend calls, session token, place suggestions
    components/      AuthPage, Planner, TripForm, PlaceInput, RouteList, RouteMap, ForecastSlider
    utils/           formatting, geometry, risk colors, heatmap rendering, map style
    styles.css       Tailwind theme tokens, shared component classes, MapLibre overrides
docker-compose.yml   Postgres + backend (gunicorn) + frontend (nginx, proxies /api)
```

## With more time

Things left out for time constraints, roughly in order of value:

- **Intercontinental and non-US trips.** Geocoding and suggestions search the whole world, but a trip across an ocean only fails at the routing step with "No road route found", after two geocoding calls. Trips within another continent can route, but the app assumes the US: miles, a gust offset based on National Weather Service criteria, and a map that starts over the US. The simplest fix is to limit origins and destinations to North America in both geocoders and the suggestion list. A fuller one checks the continent up front and gives a clear message.
- **Better caching.** The cache is in-process memory, so it's lost on every restart and forces gunicorn to a single process. Redis would let it survive restarts and scale to several workers. Route options aren't cached at all, and could be, keyed by the rounded origin and destination. Forecasts could expire when the weather model publishes a new run instead of after a fixed 30 minutes.
- **Saving and loading trips.** Accounts already exist, so plans could be saved per user and reopened later. Old plans could also be re-checked against the latest forecast before departure, with a heads-up when a route's risk goes up.
- **Real truck routing.** Swap OSRM's car profile for a truck router (see "Routes are car routes"). That means paid APIs or self-hosting OSRM / GraphHopper with a truck profile. It brings truck speeds, bridge heights and weight limits.
- **Driver hours and rest stops.** ETAs assume nonstop driving. Adding the federal hours-of-service breaks would shift later checkpoints' forecast hours on long trips.
- **Planning as a background job.** A long trip can take several seconds because of the third-party calls and Nominatim's 1 req/s limit. A task queue plus a progress indicator would keep requests short and allow retries.
- **Rate limiting per user**, so one account can't use up the shared Open-Meteo and Nominatim quotas.
- **Frontend tests.** Only the backend has tests. Component tests for the form and slider, and a browser test of the full planning flow, would be next.
