# Resident AI Usage Leaderboard — **React + Vite** (frontend) + **FastAPI + SQLite on Modal** (API)
_A micro-app to measure and encourage safe AI usage among medical residents—fast to build, HIPAA-aware, and fun._

---

## 0) Goals & Non-Goals

**Goals**
- Track *how* and *how often* residents use AI (tasks, tools, helpfulness, time saved, verification habits).
- Provide a simple submission flow (≤30 seconds).
- Show a public leaderboard (rotation/team) and **password-protected** results dashboard (aggregates & insights).
- Keep it lightweight: **no PHI**, no logins, no invite codes.
- Make it engaging: badges/trophies, confetti, and a weekly team challenge.

**Non-Goals**
- No clinical decision support, no patient-level data or free-text case details.
- Not a permanent EMR add-on; this is a standalone, anonymous micro-app.
- No rigorous identity proofing in v1 (use *rotation/team* and optional alias only).

---

## 1) Compliance & Ethics Guardrails (HIPAA-aware, not legal advice)

- **No PHI.** Use only structured fields (radio/select/slider). **No free text** about cases in v1.
- **Consent gate**: residents must agree not to include patient identifiers and acknowledge this is for QI/Research insights, not clinical guidance.
- **Research vs QI**: If the intent is publication/generalizable knowledge, route to IRB for potential Exempt (e.g., surveys, no identifiers). Keep the dataset de-identified.
- **Privacy**: No IP logging at rest; if rate-limiting requires IP, hash in-memory only and never persist. Provide a plain-language privacy notice.
- **Security**: Password-protect the results API (server-side check). Don’t embed secrets in the client.

---

## 2) System Architecture

**Overview**
- **Frontend**: React + Vite + Tailwind + shadcn/ui • Public static site (Vercel/Netlify or Modal web static).
- **API**: FastAPI + SQLite • Hosted on **Modal** with a **Modal Volume** for persistent SQLite file.
- **Auth model**: Public submissions; **results endpoints require a shared password** in an HTTP header.
- **Analytics**: Aggregates computed on read via SQL views; optional nightly snapshot job.

[Resident (mobile)] --QR--> [React/Vite static app]
| |
| POST /api/submissions | GET /api/leaderboard (public)
+-------------------------------> |
v
[FastAPI on Modal] --- SQLite on Modal Volume
^
|
GET /api/results (requires X-Results-Password)

pgsql
Copy code

---

## 3) Data Model (SQLite)

> **Design intent**: Structured, enumerated fields only. No free text except optional local **alias** (public display name) which is **client-side only**, unless you decide to store it. Default v1: do **not** store alias server-side.

```sql
-- 3.1 Enumerations (enforced via CHECKs or app layer)
-- Adjust lists to your program context

-- We'll store enums as TEXT with CHECK constraints for portability.
-- Alternatively enforce strictly in the API layer and keep DB simple.

CREATE TABLE submissions (
  id              TEXT PRIMARY KEY,                       -- uuid
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  rotation        TEXT NOT NULL,                          -- e.g., 'Wards A','ICU','EM Nights','Clinic'
  used_ai         INTEGER NOT NULL CHECK (used_ai IN (0,1)),
  task            TEXT NOT NULL,                          -- e.g., 'NoteDraft','DischargeInstr','PriorAuth','PtEducation','LitSearch','Teaching','Admin','Other'
  tool            TEXT NOT NULL,                          -- e.g., 'ChatGPT','Claude','Doximity','UpToDateAI','Gemini','Institutional','Other'
  helpfulness     INTEGER CHECK (helpfulness BETWEEN 1 AND 10),
  time_saved      TEXT NOT NULL,                          -- '<5m','5-10','10-20','20-30','30+'
  verify_conf     TEXT NOT NULL,                          -- 'Always','Usually','Sometimes','Rarely','Never'
  -- Optional: if you later allow alias server-side, keep short:
  alias           TEXT CHECK (length(alias) <= 24)
);

-- 3.2 Helpful views (live aggregates)
CREATE VIEW v_team_leaderboard AS
SELECT rotation, COUNT(*) AS submissions
FROM submissions
GROUP BY rotation
ORDER BY submissions DESC;

CREATE VIEW v_usage_by_task AS
SELECT task, COUNT(*) AS n, ROUND(AVG(COALESCE(helpfulness,0)),2) AS avg_helpfulness
FROM submissions
GROUP BY task
ORDER BY n DESC;

CREATE VIEW v_tool_effectiveness AS
SELECT tool,
       COUNT(*) AS n,
       ROUND(AVG(COALESCE(helpfulness,0)),2) AS avg_helpfulness,
       SUM(CASE WHEN verify_conf IN ('Always','Usually') THEN 1 ELSE 0 END)*1.0 / COUNT(*) AS verify_often_rate
FROM submissions
GROUP BY tool
ORDER BY avg_helpfulness DESC;

CREATE VIEW v_time_saved_dist AS
SELECT time_saved, COUNT(*) AS n
FROM submissions
GROUP BY time_saved
ORDER BY n DESC;
Notes

Use UUIDv4 strings for id.

Keep alias optional in DB; consider not storing at all in v1 (you can render alias locally in UI only).

Ensure the API rejects any keys not in the schema.

4) API Contract (FastAPI)
Headers

Content-Type: application/json

For protected endpoints: X-Results-Password: <secret>

Env vars (Modal)

RESULTS_PASSWORD – required for protected routes

CORS_ALLOW_ORIGIN – e.g., https://your-frontend.app

DB_PATH – e.g., /vol/db/app.db

4.1 POST /api/submissions (public)
Create a new submission.

Request JSON

json
Copy code
{
  "rotation": "Wards A",
  "used_ai": true,
  "task": "NoteDraft",
  "tool": "ChatGPT",
  "helpfulness": 8,
  "time_saved": "10-20",
  "verify_conf": "Usually"
}
Validation rules

rotation ∈ allowed list

task ∈ allowed list

tool ∈ allowed list

time_saved ∈ {"<5m","5-10","10-20","20-30","30+"}

verify_conf ∈ {"Always","Usually","Sometimes","Rarely","Never"}

If used_ai=false, allow helpfulness to be null and still capture task to track “attempted/no use”.

Response

json
Copy code
{ "ok": true, "id": "uuid" }
4.2 GET /api/leaderboard (public)
Returns team/rotation leaderboard.

Response

json
Copy code
{
  "leaderboard": [
    { "rotation": "EM Nights", "submissions": 42 },
    { "rotation": "Wards A",   "submissions": 35 }
  ]
}
4.3 GET /api/results (protected)
Aggregated insights for the results dashboard (no raw rows in v1).

Request headers: X-Results-Password: <secret>

Query params (optional): rotation, tool, week_start (ISO date) — filter aggregates.

Response

json
Copy code
{
  "counts": { "total_submissions": 123, "unique_rotations": 6 },
  "usage_by_task": [ { "task":"NoteDraft","n":54,"avg_helpfulness":7.9 }, ... ],
  "tool_effectiveness": [ { "tool":"ChatGPT","n":77,"avg_helpfulness":8.1,"verify_often_rate":0.82 }, ... ],
  "time_saved_dist": [ { "time_saved":"10-20","n":48 }, ... ],
  "verify_conf_dist": [ { "verify_conf":"Always","n":50 }, ... ],
  "recent_activity": [ {"date":"2025-09-01","n":27}, ... ]
}
4.4 (Optional) GET /api/exports (protected, admin)
CSV of aggregates for research export (still no raw, or provide raw only after IRB exemption).

5) FastAPI on Modal (skeleton)
You’ve “done this before”; use your preferred Modal pattern. Below is a concise sketch.

md
Copy code
```python
# backend/app.py
import os, uuid, hashlib
from typing import Optional, List
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, field_validator
import sqlite3

RESULTS_PASSWORD = os.environ["RESULTS_PASSWORD"]
DB_PATH = os.environ.get("DB_PATH", "/vol/db/app.db")
CORS_ALLOW_ORIGIN = os.environ.get("CORS_ALLOW_ORIGIN", "*")

ALLOWED_ROTATIONS = ["EM Nights","Wards A","Wards B","ICU","Clinic"]
ALLOWED_TASKS = ["NoteDraft","DischargeInstr","PriorAuth","PtEducation","LitSearch","Teaching","Admin","Other"]
ALLOWED_TOOLS = ["ChatGPT","Claude","Doximity","UpToDateAI","Gemini","Institutional","Other"]
ALLOWED_TIME = ["<5m","5-10","10-20","20-30","30+"]
ALLOWED_VERIFY = ["Always","Usually","Sometimes","Rarely","Never"]

app = FastAPI()

try:
    from fastapi.middleware.cors import CORSMiddleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[CORS_ALLOW_ORIGIN] if CORS_ALLOW_ORIGIN != "*" else ["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
except Exception:
    pass

def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = db()
    conn.executescript("""
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      rotation TEXT NOT NULL,
      used_ai INTEGER NOT NULL CHECK (used_ai IN (0,1)),
      task TEXT NOT NULL,
      tool TEXT NOT NULL,
      helpfulness INTEGER CHECK (helpfulness BETWEEN 1 AND 10),
      time_saved TEXT NOT NULL,
      verify_conf TEXT NOT NULL,
      alias TEXT
    );
    CREATE VIEW IF NOT EXISTS v_team_leaderboard AS
      SELECT rotation, COUNT(*) AS submissions
      FROM submissions GROUP BY rotation ORDER BY submissions DESC;
    """)
    conn.commit()
    conn.close()

init_db()

class SubmissionIn(BaseModel):
    rotation: str
    used_ai: bool
    task: str
    tool: str
    helpfulness: Optional[int] = None
    time_saved: str
    verify_conf: str
    alias: Optional[str] = None

    @field_validator("rotation")
    @classmethod
    def rot_v(cls, v): 
        if v not in ALLOWED_ROTATIONS: raise ValueError("invalid rotation"); return v
    @field_validator("task")
    @classmethod
    def task_v(cls, v): 
        if v not in ALLOWED_TASKS: raise ValueError("invalid task"); return v
    @field_validator("tool")
    @classmethod
    def tool_v(cls, v): 
        if v not in ALLOWED_TOOLS: raise ValueError("invalid tool"); return v
    @field_validator("time_saved")
    @classmethod
    def time_v(cls, v): 
        if v not in ALLOWED_TIME: raise ValueError("invalid time_saved"); return v
    @field_validator("verify_conf")
    @classmethod
    def ver_v(cls, v): 
        if v not in ALLOWED_VERIFY: raise ValueError("invalid verify_conf"); return v

@app.post("/api/submissions")
def create_submission(s: SubmissionIn):
    if not s.used_ai and s.helpfulness is not None:
        s.helpfulness = None
    if s.alias and len(s.alias) > 24:  # paranoia
        s.alias = s.alias[:24]

    conn = db()
    conn.execute(
        """INSERT INTO submissions
           (id, rotation, used_ai, task, tool, helpfulness, time_saved, verify_conf, alias)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (
            str(uuid.uuid4()), s.rotation, int(s.used_ai), s.task, s.tool,
            s.helpfulness, s.time_saved, s.verify_conf, s.alias
        ),
    )
    conn.commit()
    conn.close()
    return {"ok": True}

def _guard(password: str):
    if not password or password != RESULTS_PASSWORD:
        raise HTTPException(status_code=401, detail="Unauthorized")

@app.get("/api/leaderboard")
def leaderboard():
    conn = db()
    rows = conn.execute("SELECT rotation, submissions FROM v_team_leaderboard").fetchall()
    conn.close()
    return {"leaderboard": [dict(r) for r in rows]}

@app.get("/api/results")
def results(x_results_password: str = Header(default=None, alias="X-Results-Password")):
    _guard(x_results_password)
    conn = db()
    counts = conn.execute("SELECT COUNT(*) AS total_submissions, COUNT(DISTINCT rotation) AS unique_rotations FROM submissions").fetchone()
    usage_by_task = conn.execute("""
        SELECT task, COUNT(*) n, ROUND(AVG(COALESCE(helpfulness,0)),2) avg_helpfulness
        FROM submissions GROUP BY task ORDER BY n DESC
    """).fetchall()
    tool_eff = conn.execute("""
        SELECT tool,
               COUNT(*) n,
               ROUND(AVG(COALESCE(helpfulness,0)),2) avg_helpfulness,
               SUM(CASE WHEN verify_conf IN ('Always','Usually') THEN 1 ELSE 0 END)*1.0 / COUNT(*)
                  AS verify_often_rate
        FROM submissions GROUP BY tool ORDER BY avg_helpfulness DESC
    """).fetchall()
    time_dist = conn.execute("SELECT time_saved, COUNT(*) n FROM submissions GROUP BY time_saved ORDER BY n DESC").fetchall()
    verify_dist = conn.execute("SELECT verify_conf, COUNT(*) n FROM submissions GROUP BY verify_conf ORDER BY n DESC").fetchall()
    recent = conn.execute("""
        SELECT DATE(created_at) as date, COUNT(*) n
        FROM submissions GROUP BY DATE(created_at)
        ORDER BY date DESC LIMIT 30
    """).fetchall()
    conn.close()
    return {
      "counts": dict(counts),
      "usage_by_task": [dict(r) for r in usage_by_task],
      "tool_effectiveness": [dict(r) for r in tool_eff],
      "time_saved_dist": [dict(r) for r in time_dist],
      "verify_conf_dist": [dict(r) for r in verify_dist],
      "recent_activity": [dict(r) for r in recent]
    }
```
Modal bits (outline)

Create a Modal Volume (e.g., resai-db) and mount at /vol.

Build an image with uv / pip deps: fastapi, uvicorn, pydantic.

Expose the ASGI app; set env vars.

md
Copy code
```python
# backend/modal_entry.py
import modal
from app import app as fastapi_app

image = modal.Image.debian_slim().pip_install(
    "fastapi", "uvicorn[standard]", "pydantic"
)

vol = modal.Volume.from_name("resai-db", create_if_missing=True)

app = modal.App("resident-ai-usage")

@app.function(image=image, volumes={"/vol": vol},
              secrets=[modal.Secret.from_dict({
                  "RESULTS_PASSWORD": "set-me",
                  "CORS_ALLOW_ORIGIN": "https://YOUR_FRONTEND_URL",
                  "DB_PATH": "/vol/db/app.db"
              })])
@modal.asgi_app()
def fastapi():
    return fastapi_app
```
Deploy

modal deploy backend/modal_entry.py

Your API base will resemble: https://<your-app>--fastapi.modal.run

6) Frontend (React + Vite + shadcn/ui)
Stack

React + Vite + TypeScript

TailwindCSS

shadcn/ui (install: Button, Card, Tabs, Select, Slider, Badge, Dialog, Input, Alert, Toast)

Icons: lucide-react (Trophy, Medal, Sparkles, ShieldCheck, Timer)

Confetti: canvas-confetti (trigger on successful submit)

Routes & Components

/ Home: 3 big cards

“Add submission” → /submit

“Leaderboard” → /leaderboard

“Results (staff only)” → /results (opens password dialog)

/submit

Consent banner (Alert): “No patient info. Structured only.”

Form fields:

Rotation (Select)

Did you use AI? (Segmented control)

Task (Select)

Tool (Select)

Helpfulness (Slider 1–10; disabled if used_ai=false)

Time saved (Select)

Verification confidence (Select)

Submit → POST /api/submissions → Toast “Thanks!” + confetti burst + optional badge hint

/leaderboard (public)

Cards showing top rotations, progress bars

Weekly challenge banner: “This week: Most ‘Patient education’ uses”

Subtle fun: tiny trophy icons for top 3 rotations

/results (protected)

On first load: Dialog asks for password → store ephemeral in memory (not localStorage, safer).

Fetch aggregates with X-Results-Password header.

Tabs: “Overview”, “By Task”, “By Tool”, “Verification”, “Time Saved”

Simple charts: bar charts via minimal SVG or your lightweight lib of choice, or stacked cards for speed.

Microcopy & UI Rules

Keep 1-line tooltips (e.g., “Verify everything that affects patients.”).

Avoid jargon; emphasize “no patient info.”

Confetti: one burst on first successful submission per session.

shadcn install quick notes

bash
Copy code
# assuming Tailwind already set up
npx shadcn@latest init
npx shadcn@latest add button card tabs select slider badge dialog input alert toast
npm i lucide-react canvas-confetti
7) Gamification (safe & lightweight)
Badges (client-side only in v1):

“First 5 submissions”

“Tried a new tool”

“Verification Champion” (>80% ‘Always/Usually’)

Team challenge: Rotate weekly focus (task category). The UI can highlight current goal.

Confetti: Pop on submission success.

Raffles: Every submission = 1 entry (announce winners outside the app).

Avoid per-resident public rankings in v1; keep it rotation/team to prevent social pressure and reduce any perception of monitoring.

8) QR Code & Posters
Generate a static QR pointing to /submit.

Poster text (short):
“30-sec AI usage check-in. No patient info. Help research & win swag! → [QR]”

9) Security & Abuse
Results API: password via X-Results-Password (server-side compare with env).

CORS: restrict to your frontend origin.

Rate limit: minimally throttle POST /submissions by IP in memory (don’t persist IP).

Strict validation: reject unknown keys; enforce enum values; cap payload size (e.g., 1–2 KB).

Headers only auth: don’t ship the password in client code; collect at runtime via dialog.

10) Dev & Deploy Steps (End-to-End)
Frontend scaffold

bash
Copy code
npm create vite@latest resident-ai -- --template react-ts
cd resident-ai
npm i -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
# configure tailwind in index.css + tailwind.config
npx shadcn@latest init
npx shadcn@latest add button card tabs select slider badge dialog input alert toast
npm i lucide-react canvas-confetti
Env

VITE_API_BASE=https://<your-modal-app>--fastapi.modal.run

API scaffold

Add backend/app.py and backend/modal_entry.py from above.

Create Modal Volume resai-db.

modal deploy backend/modal_entry.py

Test locally

Use a local FastAPI (uvicorn) with same DB schema for dev, or point to Modal staging.

Run Vite: npm run dev

Ship

Build frontend: npm run build and host static (Vercel/Netlify) OR serve via your preferred static host.

Print posters with the QR to /submit.

11) Analytics & Research Readiness
Core metrics: DAU, submissions/day, usage by task, avg helpfulness, time-saved distribution, verification rates.

Equity check: rotation coverage (are nights under-represented?).

Change over time: compare pre/post interventions (e.g., prompt library demo).

Exports (protected): aggregate CSV only; for raw data, route through IRB.

12) Content: Consent & Notices (paste into UI)
Consent/Notice (submit page alert)

By continuing, you agree not to share any patient information. This tool records only de-identified, structured data about your workflow. It is for quality improvement and research insights and does not provide clinical guidance. Verify all AI outputs that could affect patient care.

Results page footer

Results are aggregated. No PHI is collected. For publication or external sharing, consult your IRB.

13) Enumerations (starter lists—edit for your site)
Rotations

EM Nights, Wards A, Wards B, ICU, Clinic

Tasks

NoteDraft, DischargeInstr, PriorAuth, PtEducation, LitSearch, Teaching, Admin, Other

Tools

ChatGPT, Claude, Doximity, UpToDateAI, Gemini, Institutional, Other

Time Saved

<5m, 5-10, 10-20, 20-30, 30+

Verification Confidence

Always, Usually, Sometimes, Rarely, Never

14) Nice-to-Haves (v1.1+)
“Prompt of the Week” card (safe, de-identified pattern only).

Server-side badge issuance (if you later add identity/aliases).

Filterable results by rotation or tool (still aggregated).

Nightly snapshot table for faster dashboards.

Admin email digest (Modal cron function).

15) Testing Checklist
 Payload validation rejects any unknown fields

 used_ai=false allows submit without helpfulness

 Results endpoint rejects missing/wrong password

 CORS only allows your frontend origin

 No free-text fields present

 Confetti fires once per session on submit

 Accessibility: focus order, keyboard nav, aria labels

16) Future Identity Options (if you ever want individual gamification)
Opt-in alias stored server-side (no real names; enforce 24-char, alnum+underscore).

Local storage only for alias (v1) to avoid any PII on server.

Invite codes (later) if impersonation becomes a concern.

Appendix A — Minimal Frontend Submit Form (sketch)
tsx
Copy code
// src/pages/Submit.tsx
import { useState } from "react";
import confetti from "canvas-confetti";
import { Button, Card, Select, Slider, Alert } from "@/components/ui"; // shadcn imports as configured

const ROTATIONS = ["EM Nights","Wards A","Wards B","ICU","Clinic"] as const;
const TASKS = ["NoteDraft","DischargeInstr","PriorAuth","PtEducation","LitSearch","Teaching","Admin","Other"] as const;
const TOOLS = ["ChatGPT","Claude","Doximity","UpToDateAI","Gemini","Institutional","Other"] as const;
const TIME = ["<5m","5-10","10-20","20-30","30+"] as const;
const VERIFY = ["Always","Usually","Sometimes","Rarely","Never"] as const;

export default function Submit() {
  const [usedAI, setUsedAI] = useState(true);
  const [helpfulness, setHelpfulness] = useState(7);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload: any = Object.fromEntries(form.entries());
    payload.used_ai = payload.used_ai === "true";
    payload.helpfulness = payload.used_ai ? Number(payload.helpfulness) : null;

    const res = await fetch(import.meta.env.VITE_API_BASE + "/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      confetti();
      e.currentTarget.reset();
    } else {
      alert("Error submitting. Try again.");
    }
  }

  return (
    <div className="max-w-xl mx-auto p-4">
      <Alert className="mb-3">
        No patient info. Structured fields only. Verify any AI content that could affect patients.
      </Alert>
      <Card className="p-4">
        <form onSubmit={onSubmit}>
          <label className="block mb-2">Rotation</label>
          <select name="rotation" required className="mb-3 w-full">{ROTATIONS.map(r => <option key={r}>{r}</option>)}</select>

          <label className="block mb-2">Did you use AI?</label>
          <div className="flex gap-2 mb-3">
            <Button type="button" variant={usedAI ? "default" : "outline"} onClick={() => setUsedAI(true)}>Yes</Button>
            <Button type="button" variant={!usedAI ? "default" : "outline"} onClick={() => setUsedAI(false)}>No</Button>
          </div>
          <input type="hidden" name="used_ai" value={usedAI ? "true" : "false"} />

          <label className="block mb-2">Task</label>
          <select name="task" required className="mb-3 w-full">{TASKS.map(t => <option key={t}>{t}</option>)}</select>

          <label className="block mb-2">Tool</label>
          <select name="tool" required className="mb-3 w-full">{TOOLS.map(t => <option key={t}>{t}</option>)}</select>

          <label className="block mb-2">Time saved</label>
          <select name="time_saved" required className="mb-3 w-full">{TIME.map(t => <option key={t}>{t}</option>)}</select>

          <label className="block mb-2">Verification confidence</label>
          <select name="verify_conf" required className="mb-3 w-full">{VERIFY.map(v => <option key={v}>{v}</option>)}</select>

          <fieldset disabled={!usedAI} className={!usedAI ? "opacity-50" : ""}>
            <label className="block mb-1">Helpfulness {usedAI ? `(${helpfulness})` : ""}</label>
            <input type="range" name="helpfulness" min={1} max={10} value={helpfulness} onChange={e => setHelpfulness(Number(e.target.value))} className="w-full mb-4" />
          </fieldset>

          <Button type="submit" className="w-full">Submit (≤30s)</Button>
        </form>
      </Card>
    </div>
  );
}
That’s it. This spec keeps the build tiny, the UX crisp, and the data safe—and you can scale up identity or research rigor later without re-platforming.