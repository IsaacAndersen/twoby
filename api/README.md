# twoby API

FastAPI backend for the twoby opinion mapping platform.

## Architecture

- **Backend**: FastAPI (Python 3.12)
- **Database**: SQLite (local) / PostgreSQL (production via Supabase)
- **Storage**: Supabase Storage (for images)
- **Deployment**: Railway

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

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Production |
| `PEPPER` | Secret for password hashing | Yes |
| `OPENAI_API_KEY` | OpenAI API key for AI features | Optional |
| `GOOGLE_API_KEY` | Google API key for image search | Optional |
| `GOOGLE_CSE_ID` | Google Custom Search Engine ID | Optional |
| `SUPABASE_URL` | Supabase project URL | Optional |
| `SUPABASE_KEY` | Supabase service role key | Optional |

## Railway Deployment

1. Connect your GitHub repository to Railway
2. Set environment variables in Railway dashboard
3. Railway will auto-deploy on push to main

```bash
# Build Docker image locally
make docker-build

# Run Docker image locally
make docker-run
```

## API Endpoints

### Charts
- `POST /api/charts` - Create a new chart
- `POST /api/charts/{id}/items?k={admin_key}` - Add items to chart
- `GET /api/charts/{id}/public?s={share_key}` - Get chart data
- `GET /api/charts/public` - List public charts
- `GET /api/charts/feed?filter=trending|new|featured&limit=12&offset=0&mode=two_axis` - Public feed
- `GET /api/charts/{id}/feedback?k={admin_key}` - Get feedback
- `GET /api/charts/{id}/export-csv?k={admin_key}` - Export to CSV

### Voting
- `POST /api/vote/pair?s={share_key}` - Submit pairwise vote
- `POST /api/vote/explicit?s={share_key}` - Submit explicit vote

### AI Features
- `POST /api/ai/suggest` - Get AI suggestions
- `POST /api/ai/generate-items` - Generate items
- `POST /api/ai/generate-axes` - Generate axes
- `POST /api/ai/generate-description` - Generate description

### Images
- `GET /api/images/search?q={query}` - Search images
- `POST /api/images/auto-pick` - Auto-pick image
- `POST /api/images/bulk-auto-pick` - Bulk auto-pick
- `POST /api/images/attach` - Attach image to item

### Other
- `POST /api/short-urls` - Create short URL
- `GET /s/{short_code}` - Redirect short URL
- `POST /api/feedback` - Submit feedback
- `GET /api/og/chart/{id}` - Get OpenGraph image
- `GET /health` - Health check
