# twoby — 0→1 SPEC + EXECUTION PLAN (Modal + FastAPI + SQLite on Volume)

> **Premise & Goals**
>
> - **What**: A lightweight SaaS to create & share “opinion maps” with three modes out of the box — **Tier List (S/A/B/C)**, **Single Axis**, and **2×2 Axis** — supporting **pairwise** and **explicit** votes in each.
> - **Why**: Fast, meme-friendly charts with credible **crowd consensus** (means + uncertainty), handy exports, and embeds. Useful for fun *and* for quick research/teaching.
> - **Approach**: Minimize friction. **No accounts** at v0; use **capability links** (admin/share). Host a single **ASGI** app on **Modal**, persist data to a **SQLite** file on a **Modal Volume**. Ship early; scale smart.

---

## High-level Architecture

- **Frontend**: Vite + React (TypeScript). Built to `apps/web/dist`, then served as static files from the same FastAPI app.
- **Backend**: FastAPI running as a **Modal `@asgi_app`** function.  
  - **Data**: single `twoby.db` **SQLite** file mounted at `/db/twoby.db` using a **Modal Volume**.  
  - **Concurrency control**: Keep **one container** (scale-out disabled for v0) to avoid multi-writer issues on SQLite; allow **concurrent inputs per container** for throughput.  
  - **Secrets**: Modal Secret for `PEPPER` (capability-link hashing).
- **Monorepo**:
  ```
  twoby/
    apps/
      api/         # FastAPI + Modal app
      web/         # Vite + React
  ```

---

## Modes & Voting (v0)

All modes support **pairwise** *and* **explicit**:

1) **Tier List (S/A/B/C)**  
   - Pairwise: “Which ranks higher?”  
   - Explicit: drag item into S/A/B/C.  
   - Consensus: latent 1-D score `r` from pairwise (Elo/Bradley–Terry) + robust mean of numeric tiers (S=4..C=1) → fused score; show bucket with uncertainty.

2) **Single Axis** (e.g., Lame↔Cool)  
   - Pairwise: “Which is more X?”  
   - Explicit: slider click (−100..100).  
   - Consensus: `x_mu, x_sigma`.

3) **2×2 Axis** (e.g., “Thinks it’s cool” vs “Is cool”)  
   - Pairwise per axis; Explicit: point drop (x,y).  
   - Consensus: `x_mu, x_sigma, y_mu, y_sigma`. Show uncertainty halos.

**Anti-abuse**: session cookie + IP/UA hashing, Turnstile (later), soft caps, basic consistency checks per rater (down-weight noisy voters).

**No accounts** at v0:  
- **Capability links**:  
  - *Admin*: `/c/{id}?k={admin_key}`  
  - *Share/Vote*: `/v/{id}?s={share_key}`  
- Store **argon2 hash** of keys + a **PEPPER** (env secret).

---

## Data Model (SQLite)

SQLite types are `TEXT`, `INTEGER`, `REAL`. UUIDs stored as `TEXT`.

```sql
-- PRAGMA for better concurrency on single-process, multi-thread
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;

-- charts
create table if not exists charts (
  id           text primary key,           -- uuid
  mode         text not null check (mode in ('tier','single_axis','two_axis')),
  title        text not null,
  x_label      text,
  y_label      text,
  visibility   text not null default 'unlisted', -- public|unlisted|private
  admin_key_hash text not null,
  share_key_hash text not null,
  created_at   text not null               -- ISO datetime
);

-- items
create table if not exists items (
  id        text primary key,              -- uuid
  chart_id  text not null,
  label     text not null,
  status    text not null default 'active',
  foreign key(chart_id) references charts(id) on delete cascade
);

-- pairwise votes
create table if not exists pair_votes (
  id        integer primary key autoincrement,
  chart_id  text not null,
  axis      text,                          -- 'x'|'y' or null
  item_a    text not null,
  item_b    text not null,
  winner    text not null,
  session_id text,
  ip_hash   text,
  ua_hash   text,
  created_at text not null
);

-- explicit votes
create table if not exists explicit_votes (
  id        integer primary key autoincrement,
  chart_id  text not null,
  item_id   text not null,
  tier      integer,                       -- S=4..C=1 (tier mode)
  x         real,                          -- single_axis & two_axis
  y         real,                          -- two_axis
  session_id text,
  ip_hash   text,
  ua_hash   text,
  created_at text not null
);

-- consensus snapshot
create table if not exists scores (
  chart_id  text not null,
  item_id   text not null,
  r_x       real default 1000,             -- Elo baseline
  r_y       real default 1000,
  x_mu      real, x_sigma real, n_x integer default 0,
  y_mu      real, y_sigma real, n_y integer default 0,
  tier_mu   real, tier_sigma real, n_tier integer default 0,
  updated_at text not null,
  primary key(chart_id, item_id),
  foreign key(chart_id) references charts(id) on delete cascade,
  foreign key(item_id) references items(id) on delete cascade
);
```

---

## Modal + FastAPI setup (serverless, single container, volume-mounted SQLite)

> **Key ideas**:
> - Use `@modal.asgi_app()` to expose a full FastAPI.  
> - Create a **Volume** via CLI and mount it at `/db`.  
> - Keep **max_containers=1** to protect SQLite from multi-writer issues; use `@modal.concurrent(max_inputs=64)` to let one container process many requests concurrently.  
> - Call `volume.commit()` after writes you want durably persisted right away (Modal does background commits too).

### 1) Create the volume
```bash
pip install modal
modal setup
modal volume create twoby-sqlite
```

### 2) Modal app file: `apps/api/modal_app.py`
```python
# apps/api/modal_app.py
import modal

app = modal.App("twoby-api")

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("fastapi[standard]", "argon2-cffi==23.*", "orjson==3.*")
)

# Persisted volume for SQLite database
volume = modal.Volume.from_name("twoby-sqlite", create_if_missing=True)

@app.function(
    image=image,
    volumes={"/db": volume},
    # keep exactly one container to avoid multi-writer SQLite issues
    min_containers=1,
    max_containers=1,
    timeout=180,
    secrets=[modal.Secret.from_name("twoby-env")]  # contains PEPPER
)
@modal.concurrent(max_inputs=64)  # many requests handled within the single container
@modal.asgi_app()
def fastapi_app():
    # Late imports inside container
    import os, uuid, time, hashlib, sqlite3
    from datetime import datetime
    from fastapi import FastAPI, HTTPException, Request, Query
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.staticfiles import StaticFiles

    PEPPER = os.environ.get("PEPPER", "")

    DB_PATH = "/db/twoby.db"

    def now_iso():
        return datetime.utcnow().isoformat(timespec="seconds") + "Z"

    # Ensure DB and schema exist
    def get_conn():
        # Create per-request connection; SQLite serializes writers internally.
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.row_factory = sqlite3.Row
        return conn

    def init_db():
        conn = get_conn()
        cur = conn.cursor()
        for stmt in SCHEMA_SQL.strip().split(";\n\n"):
            if stmt.strip():
                cur.execute(stmt)
        conn.commit()
        conn.close()

    SCHEMA_SQL = r"""
    PRAGMA journal_mode=WAL;
    PRAGMA synchronous=NORMAL;

    create table if not exists charts (
      id           text primary key,
      mode         text not null check (mode in ('tier','single_axis','two_axis')),
      title        text not null,
      x_label      text,
      y_label      text,
      visibility   text not null default 'unlisted',
      admin_key_hash text not null,
      share_key_hash text not null,
      created_at   text not null
    );

    create table if not exists items (
      id        text primary key,
      chart_id  text not null,
      label     text not null,
      status    text not null default 'active',
      foreign key(chart_id) references charts(id) on delete cascade
    );

    create table if not exists pair_votes (
      id        integer primary key autoincrement,
      chart_id  text not null,
      axis      text,
      item_a    text not null,
      item_b    text not null,
      winner    text not null,
      session_id text,
      ip_hash   text,
      ua_hash   text,
      created_at text not null
    );

    create table if not exists explicit_votes (
      id        integer primary key autoincrement,
      chart_id  text not null,
      item_id   text not null,
      tier      integer,
      x         real,
      y         real,
      session_id text,
      ip_hash   text,
      ua_hash   text,
      created_at text not null
    );

    create table if not exists scores (
      chart_id  text not null,
      item_id   text not null,
      r_x       real default 1000,
      r_y       real default 1000,
      x_mu      real, x_sigma real, n_x integer default 0,
      y_mu      real, y_sigma real, n_y integer default 0,
      tier_mu   real, tier_sigma real, n_tier integer default 0,
      updated_at text not null,
      primary key(chart_id, item_id)
    );
    """

    def h(s: str) -> str:
        # fast non-reversible hash for IP/UA fingerprints (not security-critical)
        return hashlib.sha256((s or "").encode()).hexdigest()

    def make_id() -> str:
        return str(uuid.uuid4())

    def argon_hash(ph, raw: str) -> str:
        # Defer import to avoid import at module top
        return ph.hash(raw + PEPPER)

    # Build app
    from argon2 import PasswordHasher
    ph = PasswordHasher()

    app = FastAPI(title="twoby")

    # CORS (helpful during local dev; not needed if FE served by same app)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Serve static frontend if present (copy built files to apps/api/static)
    static_dir = os.path.join(os.path.dirname(__file__), "static")
    if os.path.isdir(static_dir):
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

    # Init DB on cold start
    init_db()

    # --- Capability verification helpers ---
    def verify_capability(chart_id: str, key: str, admin: bool) -> bool:
        col = "admin_key_hash" if admin else "share_key_hash"
        conn = get_conn(); cur = conn.cursor()
        cur.execute(f"select {col} from charts where id=?", (chart_id,))
        row = cur.fetchone(); conn.close()
        if not row: return False
        try:
            from argon2 import PasswordHasher
            phv = PasswordHasher()
            phv.verify(row[col], key + PEPPER)
            return True
        except Exception:
            return False

    # --- Routes ---

    @app.post("/api/charts")
    def create_chart(payload: dict):
        title = payload.get("title"); mode = payload.get("mode")
        x_label = payload.get("x_label"); y_label = payload.get("y_label")
        if not title or mode not in ("tier","single_axis","two_axis"):
            raise HTTPException(400, "title/mode required")
        chart_id = make_id()
        import secrets
        admin_key = secrets.token_urlsafe(24)
        share_key = secrets.token_urlsafe(16)

        conn = get_conn(); cur = conn.cursor()
        cur.execute(
            "insert into charts (id,mode,title,x_label,y_label,admin_key_hash,share_key_hash,created_at) "
            "values (?,?,?,?,?,?,?,?)",
            (chart_id, mode, title, x_label, y_label, argon_hash(ph, admin_key), argon_hash(ph, share_key), now_iso())
        )
        conn.commit(); conn.close()
        # Persist volume state
        volume.commit()
        return {
            "id": chart_id,
            "admin_url": f"/c/{chart_id}?k={admin_key}",
            "share_url": f"/v/{chart_id}?s={share_key}",
        }

    @app.post("/api/charts/{chart_id}/items")
    def add_items(chart_id: str, request: Request, k: str = Query(None)):
        if not verify_capability(chart_id, k or "", admin=True):
            raise HTTPException(403, "invalid admin key")
        body = (request.json() if hasattr(request, "json") else None)
        # In FastAPI sync path, request.json is awaitable; keep simple:
        import json, asyncio
        if asyncio.iscoroutinefunction(request.json):  # defensive
            body = asyncio.get_event_loop().run_until_complete(request.json())
        else:
            body = body or {}
        items = body.get("items", [])
        if not items: return {"ok": True}
        conn = get_conn(); cur = conn.cursor()
        for it in items:
            item_id = make_id()
            cur.execute("insert into items (id,chart_id,label,status) values (?,?,?,?)",
                        (item_id, chart_id, it["label"], "active"))
            cur.execute("insert or ignore into scores (chart_id,item_id,updated_at) values (?,?,?)",
                        (chart_id, item_id, now_iso()))
        conn.commit(); conn.close()
        volume.commit()
        return {"ok": True}

    def elo_update(ri: float, rj: float, winner_i: bool, K: float=24.0):
        Ei = 1.0 / (1.0 + 10 ** ((rj - ri)/400.0))
        if winner_i:
            return ri + K * (1 - Ei), rj - K * (1 - Ei)
        else:
            return ri - K * Ei, rj + K * Ei

    @app.post("/api/vote/pair")
    def vote_pair(payload: dict, request: Request, s: str = Query(...)):
        chart_id = str(payload["chart_id"])
        if not verify_capability(chart_id, s, admin=False):
            raise HTTPException(403, "invalid share key")
        axis = payload.get("axis")  # 'x','y', or None
        item_a, item_b, winner = payload["item_a"], payload["item_b"], payload["winner"]

        conn = get_conn(); cur = conn.cursor()
        cur.execute("insert into pair_votes (chart_id,axis,item_a,item_b,winner,ip_hash,ua_hash,created_at) "
                    "values (?,?,?,?,?,?,?,?)",
                    (chart_id, axis, item_a, item_b, winner, h("ip:"+request.client.host), h("ua:"+request.headers.get("User-Agent","")), now_iso()))

        # Load ratings
        cur.execute("select item_id, r_x, r_y from scores where chart_id=? and item_id in (?,?)",
                    (chart_id, item_a, item_b))
        rows = {r["item_id"]: (r["r_x"], r["r_y"]) for r in cur.fetchall()}
        if len(rows)==2:
            ra_x, ra_y = rows[item_a]; rb_x, rb_y = rows[item_b]
            if axis in ("x", None):
                ra2, rb2 = elo_update(ra_x or 1000, rb_x or 1000, winner==item_a)
                cur.execute("update scores set r_x=?, updated_at=? where chart_id=? and item_id=?",
                            (ra2, now_iso(), chart_id, item_a))
                cur.execute("update scores set r_x=?, updated_at=? where chart_id=? and item_id=?",
                            (rb2, now_iso(), chart_id, item_b))
            if axis == "y":
                ra2, rb2 = elo_update(ra_y or 1000, rb_y or 1000, winner==item_a)
                cur.execute("update scores set r_y=?, updated_at=? where chart_id=? and item_id=?",
                            (ra2, now_iso(), chart_id, item_a))
                cur.execute("update scores set r_y=?, updated_at=? where chart_id=? and item_id=?",
                            (rb2, now_iso(), chart_id, item_b))
        conn.commit(); conn.close()
        volume.commit()
        return {"ok": True}

    @app.post("/api/vote/explicit")
    def vote_explicit(payload: dict, request: Request, s: str = Query(...)):
        chart_id = str(payload["chart_id"])
        if not verify_capability(chart_id, s, admin=False):
            raise HTTPException(403, "invalid share key")
        item_id = payload["item_id"]
        tier = payload.get("tier"); x = payload.get("x"); y = payload.get("y")

        conn = get_conn(); cur = conn.cursor()
        cur.execute("insert into explicit_votes (chart_id,item_id,tier,x,y,ip_hash,ua_hash,created_at) "
                    "values (?,?,?,?,?,?,?,?)",
                    (chart_id, item_id, tier, x, y, h("ip:"+request.client.host), h("ua:"+request.headers.get("User-Agent","")), now_iso()))

        # Incremental means
        if x is not None:
            cur.execute("select coalesce(n_x,0), coalesce(x_mu,0) from scores where chart_id=? and item_id=?",(chart_id,item_id))
            n, mu = cur.fetchone()
            n2 = (n or 0) + 1
            mu2 = (mu if n else x) if n==0 else (mu*n + x)/n2
            cur.execute("update scores set n_x=?, x_mu=?, updated_at=? where chart_id=? and item_id=?",
                        (n2, mu2, now_iso(), chart_id, item_id))
        if y is not None:
            cur.execute("select coalesce(n_y,0), coalesce(y_mu,0) from scores where chart_id=? and item_id=?",(chart_id,item_id))
            n, mu = cur.fetchone()
            n2 = (n or 0) + 1
            mu2 = (mu if n else y) if n==0 else (mu*n + y)/n2
            cur.execute("update scores set n_y=?, y_mu=?, updated_at=? where chart_id=? and item_id=?",
                        (n2, mu2, now_iso(), chart_id, item_id))
        if tier is not None:
            cur.execute("select coalesce(n_tier,0), coalesce(tier_mu,0) from scores where chart_id=? and item_id=?",(chart_id,item_id))
            n, mu = cur.fetchone()
            n2 = (n or 0) + 1
            mu2 = (mu if n else tier) if n==0 else (mu*n + tier)/n2
            cur.execute("update scores set n_tier=?, tier_mu=?, updated_at=? where chart_id=? and item_id=?",
                        (n2, mu2, now_iso(), chart_id, item_id))
        conn.commit(); conn.close()
        volume.commit()
        return {"ok": True}

    @app.get("/api/charts/{chart_id}/public")
    def get_public(chart_id: str, s: str = Query(...)):
        # Validate share key by verifying argon2 hash
        conn = get_conn(); cur = conn.cursor()
        cur.execute("select share_key_hash,title,mode,x_label,y_label from charts where id=?", (chart_id,))
        row = cur.fetchone()
        if not row: 
            conn.close()
            raise HTTPException(404, "not found")
        from argon2 import PasswordHasher
        try:
            PasswordHasher().verify(row["share_key_hash"], s + PEPPER)
        except Exception:
            conn.close()
            raise HTTPException(403, "invalid share key")

        cur.execute("""select i.id, i.label, sc.r_x, sc.r_y, sc.x_mu, sc.y_mu, sc.tier_mu
                       from items i left join scores sc on sc.chart_id=i.chart_id and sc.item_id=i.id
                       where i.chart_id=? and i.status='active'""", (chart_id,))
        items = [dict(id=r["id"], label=r["label"], r_x=r["r_x"], r_y=r["r_y"],
                      x_mu=r["x_mu"], y_mu=r["y_mu"], tier_mu=r["tier_mu"]) for r in cur.fetchall()]
        conn.close()
        return {"title": row["title"], "mode": row["mode"], "x_label": row["x_label"], "y_label": row["y_label"], "items": items}

    return app
```

> **Notes**  
> - We set **`max_containers=1`** to prevent multiple containers writing to the same SQLite file.  
> - `@modal.concurrent(max_inputs=64)` lets one container handle many simultaneous requests (ASGI).  
> - After write operations we call `volume.commit()`; Modal also performs **background commits**.  
> - If you later split read/write across different functions/containers, use `volume.reload()` where readers need to see fresh commits.

---

## Frontend (Vite + React, minimal)

### Scaffold & dev
```bash
cd apps
npm create vite@latest web -- --template react-ts
cd web && pnpm i
pnpm dev
```

### Minimal creator flow (Create chart + add items)
```tsx
// apps/web/src/pages/Create.tsx (sketch)
import { useState } from "react";

export default function Create() {
  const [title, setTitle] = useState("Bike Coolness");
  const [mode, setMode] = useState<"two_axis"|"single_axis"|"tier">("two_axis");
  const [x, setX] = useState("Thinks it's cool");
  const [y, setY] = useState("Is cool");
  const [list, setList] = useState("Specialized\nTrek\nCanyon");

  async function api(path: string, init?: RequestInit) {
    const r = await fetch(path, { headers: { "Content-Type":"application/json" }, ...init });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  async function go() {
    const res = await api("/api/charts", { method: "POST", body: JSON.stringify({ title, mode, x_label: x, y_label: y })});
    const adminKey = new URLSearchParams(res.admin_url.split("?")[1]).get("k")!;
    await api(`/api/charts/${res.id}/items?k=${encodeURIComponent(adminKey)}`, { method: "POST", body: JSON.stringify({ items: list.split("\n").filter(Boolean).map(l => ({label:l})) })});
    alert(`Share link:\n${res.share_url}\n\nAdmin link:\n${res.admin_url}`);
  }

  return (<div style={{maxWidth:720,margin:"2rem auto",fontFamily:"system-ui"}}>
    <h1>twoby — Create</h1>
    <label>Title <input value={title} onChange={e=>setTitle(e.target.value)} /></label><br/>
    <label>Mode <select value={mode} onChange={e=>setMode(e.target.value as any)}>
      <option value="two_axis">2×2</option>
      <option value="single_axis">Single Axis</option>
      <option value="tier">Tier (S/A/B/C)</option>
    </select></label><br/>
    <label>X Label <input value={x} onChange={e=>setX(e.target.value)} /></label><br/>
    <label>Y Label <input disabled={mode!=="two_axis"} value={y} onChange={e=>setY(e.target.value)} /></label><br/>
    <label>Items (one per line)<br/>
      <textarea rows={8} value={list} onChange={e=>setList(e.target.value)} />
    </label><br/>
    <button onClick={go}>Create</button>
  </div>);
}
```

### Build & bundle into API image
```bash
# from repo root
cd apps/web && pnpm build
# copy static assets so FastAPI can serve them
rm -rf ../api/static && mkdir -p ../api/static && cp -r dist/* ../api/static/
```

---

## CLI — local dev & deploy

- **Run locally (ephemeral URL)**:
  ```bash
  modal serve apps/api/modal_app.py
  ```
- **Deploy (persistent URL)**:
  ```bash
  modal deploy apps/api/modal_app.py
  ```
- **Create/list volumes & interact**:
  ```bash
  modal volume create twoby-sqlite
  modal volume ls
  modal volume get twoby-sqlite /db/twoby.db twoby.db    # download
  ```

---

## Execution Plan (Day-by-day, copy/paste checklist)

**Day 0 — Repo & tools**
- Initialize monorepo (`apps/api`, `apps/web`).
- `pip install modal`, `modal setup`; `pnpm i` in `apps/web`.
- Create Modal Secret `twoby-env` → add `PEPPER=<random-long-string>`.

**Day 1 — Modal + FastAPI skeleton**
- Add `apps/api/modal_app.py` from above.
- `modal volume create twoby-sqlite`.
- `modal serve apps/api/modal_app.py` → verify health JSON at root (once static exists) or hit `/docs` (if you enable FastAPI docs for dev).

**Day 2 — DB schema + endpoints**
- Implement `/api/charts`, `/api/charts/{id}/items`, `/api/vote/pair`, `/api/vote/explicit`, `/api/charts/{id}/public` (in the sample above).
- Verify writes update `scores` and a subsequent GET returns the data.

**Day 3 — Frontend create flow**
- Build minimal Create page (above), call API create + add items.
- Echo back admin/share links and test with curl/postman.

**Day 4 — Vote UI (MVP)**
- Build pairwise loop (X then Y) and explicit slider/point-drop UI.
- Hook to `/api/vote/*`, reveal results after N interactions.

**Day 5 — Results view**
- Read `/public` and render:  
  - Tier: columns S/A/B/C list with chips + counts.  
  - Single Axis: jittered labels on a line + density.  
  - 2×2: points + labels, simple collision-avoid, halos from `sigma` later.

**Day 6 — Polish & deploy**
- Bundle FE into `apps/api/static` (FastAPI serves it).
- `modal deploy apps/api/modal_app.py` → claim URL.  
- Sanity checks: rate limits per IP/session, hide keys in UI.

**Post-v0**
- Add **balanced pair-fetch** endpoint to avoid repeats per session.
- Add **export CSV** endpoint for `scores` and votes (owner only).
- Add Cloudflare Turnstile; add simple IP-based soft caps.
- Consider read/write split and a background **recompute** job (still single container or queued).

---

## Non-obvious Gotchas & Defaults

- **SQLite on Volume, concurrency**: Keep **`max_containers=1`** for the function hosting the DB writes; SQLite handles single-process concurrency fine. Scale later by promoting to Postgres or by sharding charts.
- **Volume semantics**: Call `volume.commit()` after critical writes; if another container/function needs to read fresh data, it should call `volume.reload()`. Modal also runs **background commits** every few seconds.
- **CORS**: If serving FE and API from the same Modal app, you can omit CORS. During local dev, allow `*` and tighten later.
- **Security**: Capability links are bearer-style; treat admin URLs carefully and never log raw keys. Only **argon2 hashes** + **PEPPER** are stored.

---

## Minimal API surface (v0)

```
POST   /api/charts                   {title, mode, x_label?, y_label?} -> {id, admin_url, share_url}
POST   /api/charts/:id/items?k=...   {items:[{label},...]}             -> {ok:true}
POST   /api/vote/pair?s=...          {chart_id, axis?, item_a, item_b, winner} -> {ok:true}
POST   /api/vote/explicit?s=...      {chart_id, item_id, tier?, x?, y?}        -> {ok:true}
GET    /api/charts/:id/public?s=...  -> {title, mode, x_label, y_label, items:[...]}
```

---

## Acceptance for “1”
- Create chart → get **admin/share** links.
- Add items → `scores` rows present.
- Cast pairwise & explicit votes → `scores` update.
- Public endpoint returns sensible consensus for all 3 modes.
- Frontend can create, vote, and view results.
- Deployed URL (Modal) serves both UI and API.

---