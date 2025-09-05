# Resident AI Usage Survey App

A micro-app to measure and encourage safe AI usage among medical residents. Built with React + Vite frontend and FastAPI + SQLite backend deployed on Modal.

## Features

- **Anonymous Submissions**: 30-second check-ins about AI usage with no patient data
- **Team Leaderboard**: Gamified team competition with weekly challenges
- **Results Dashboard**: Password-protected analytics for staff and research
- **HIPAA-aware**: Structured data only, no free text, no PHI collection
- **Mobile-friendly**: QR code accessible interface

## Architecture

### Frontend (React + Vite + shadcn/ui)
- Modern React app with TypeScript
- TailwindCSS and shadcn/ui for styling
- React Router for navigation
- Canvas-confetti for gamification

### Backend (FastAPI + SQLite + Modal)
- FastAPI REST API
- SQLite database with Modal Volume persistence
- Password-protected results endpoint
- CORS configured for production

## Quick Start

### Backend Development

1. Install dependencies:
```bash
cd resident_survey_apps/backend
pip install fastapi[standard] pydantic uvicorn
```

2. Run locally:
```bash
uvicorn app:app --reload --port 8000
```

3. Deploy to Modal:
```bash
# Update secrets in modal_entry.py first
modal deploy modal_entry.py
```

### Frontend Development

1. Install dependencies:
```bash
cd resident_survey_apps/frontend
npm install
```

2. Set up environment:
```bash
cp .env.example .env
# Edit VITE_API_BASE to point to your API
```

3. Run development server:
```bash
npm run dev
```

4. Build for production:
```bash
npm run build
```

## Configuration

### Backend Environment Variables
- `RESULTS_PASSWORD`: Password for accessing results dashboard
- `DB_PATH`: Path to SQLite database file (default: `/vol/db/app.db`)
- `CORS_ALLOW_ORIGIN`: Frontend URL for CORS (use `*` for development)

### Frontend Environment Variables
- `VITE_API_BASE`: Backend API base URL

## API Endpoints

### Public Endpoints
- `POST /api/submissions` - Submit new usage data
- `GET /api/leaderboard` - Get team leaderboard
- `GET /api/constants` - Get allowed values for dropdowns

### Protected Endpoints
- `GET /api/results` - Get aggregated analytics (requires `X-Results-Password` header)

## Data Model

The app collects structured, enumerated data only:

- **Rotation**: Current rotation/team assignment
- **Used AI**: Boolean flag for AI usage
- **Task**: Type of task (NoteDraft, DischargeInstr, etc.)
- **Tool**: AI tool used (ChatGPT, Claude, etc.)
- **Helpfulness**: 1-10 scale rating (only if AI was used)
- **Time Saved**: Estimated time savings bracket
- **Verification Confidence**: How often AI outputs are verified
- **Alias**: Optional display name (max 24 chars, for leaderboard only)

## Compliance & Ethics

- **No PHI**: Only structured, enumerated fields accepted
- **Consent**: Clear consent banner explaining data usage
- **Privacy**: No IP logging, minimal data collection
- **Security**: Password-protected results, server-side validation
- **Research**: IRB-ready aggregated exports available

## Deployment

### Modal Backend
1. Update `modal_entry.py` with your secrets
2. Run `modal deploy modal_entry.py`
3. Note the generated API URL

### Frontend Hosting
1. Build the app: `npm run build`
2. Deploy `dist/` folder to Vercel, Netlify, or any static host
3. Update CORS settings in backend with your frontend URL

## QR Code Generation

Generate QR codes pointing to `https://your-frontend.com/submit` for easy mobile access. Place on posters in:
- Resident workrooms
- Call rooms
- Break areas
- Conference rooms

## Weekly Challenges

Configure weekly focus areas in the leaderboard component:
- "Most Patient Education uses"
- "Highest verification rates"
- "Best time savings"

## Gamification Elements

- Confetti on first submission
- Team leaderboard rankings
- Weekly challenges
- Badge system (client-side)
- Raffle entries for participation

## Support

For technical issues:
1. Check the console for errors
2. Verify API connectivity
3. Ensure environment variables are set
4. Check Modal deployment status

For research/compliance questions, contact your IRB or program administrators.