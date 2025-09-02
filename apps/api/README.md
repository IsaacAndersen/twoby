# twoby API

FastAPI backend for the twoby opinion mapping platform.

## Setup

```bash
pip install -r requirements.txt
```

## Local Development

```bash
# Run locally with auto-reload
make run
# or
python3 run_local.py
```

API will be available at http://localhost:8000

## Testing

```bash
# Run all tests
make test

# Run with coverage
make coverage
```

## Modal Deployment

First, set up Modal (v1.0+):
```bash
pip install modal
modal setup
```

Create the volume and secret:
```bash
modal volume create twoby-sqlite
modal secret create twoby-env PEPPER=<your-secret-pepper>
```

Deploy:
```bash
# Development (temporary URL)
make serve

# Production (persistent URL)
make deploy
```

## API Endpoints

- `POST /api/charts` - Create a new chart
- `POST /api/charts/{id}/items?k={admin_key}` - Add items to chart
- `POST /api/vote/pair?s={share_key}` - Submit pairwise vote
- `POST /api/vote/explicit?s={share_key}` - Submit explicit vote
- `GET /api/charts/{id}/public?s={share_key}` - Get chart data
- `GET /health` - Health check