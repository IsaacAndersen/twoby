# twoby Web

React frontend for the twoby opinion mapping platform.

## Setup

```bash
npm install
```

## Development

```bash
# Start dev server (requires backend running)
npm run dev
```

The app will be available at http://localhost:5173

## Environment Variables

Create `.env.local` with:
```
VITE_API_URL=http://localhost:8000
```

## Build

```bash
npm run build
```

Output goes to `dist/` for deployment to Vercel.

## Deployment

The frontend is deployed to Vercel. Push to main to trigger automatic deployment.
