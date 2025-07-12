# Architecture

A concise but complete engineering spec for developers and AI agents.

---

## 1  Overview Diagram

```

Browser (Bootstrap 5 + JS) ──REST/JSON──▶ Flask API ──▶ NumPy Solver
▲                              │
└───── WebSocket live logs ◀───┘
│
▼
SQLite 3  ←─ SQLAlchemy ORM → Alembic migrations

````

---

## 2  Frontend (SPA)

| Concern | Implementation |
|---------|----------------|
| **Templates** | `header.html`, `body.html` via Jinja2 |
| **State** | Plain JS classes (`Sheet`, `Element`…)—all in SI units |
| **Rendering** | HTML5 Canvas + CSS transforms |
| **Controls** | Bootstrap components; custom keyboard shortcuts |

### 2.1  Canvas Flow

1. User action ⇒ JS emits `action` object.  
2. Object saved to **Action Queue** and POSTed to `/action`.  
3. Server stores in DB and, if relevant, triggers `/solve`.  
4. Result JSON returns; JS updates ViewModel and redraws.

---

## 3  Backend (Flask)

| Blueprint | Routes | Notes |
|-----------|--------|-------|
| **auth** | `/auth/register`, `/auth/login`, `/auth/logout` | bcrypt hashes; Flask-Login sessions |
| **sheet** | `/sheet`, `/sheet/<id>` | CRUD; each sheet bound to a user |
| **action** | `/action` | Persist every client action (`user_id`, `sheet_id`, `payload`, `ts`) |
| **solve** | `/solve` | Validates model, assembles K & F, returns reactions + internal forces |

### 3.1  Database Schema

| Table | Fields |
|-------|--------|
| `users` | id, email, pw_hash, created_at |
| `sheets` | id, user_id FK, name, created_at, updated_at |
| `elements` | id, sheet_id FK, json_blob |
| `actions` | id, sheet_id FK, user_id FK, json_blob, ts |

---

## 4  Solver Core

* **Element classes:** `Joint`, `Member`.
* **Assembly:** Sparse block matrices (SciPy optional).
* **Solve path:** Kx = F → reactions, internal forces, stresses.
* Handles **singular** or nearly–singular systems by SVD fallback.

---

## 5  Persistence & Replay

Every incoming action is stored verbatim.  
_Replay algorithm_:

```python
for action in Actions.query.filter_by(sheet_id=...).order_by(ts):
    vm.apply(action.json_blob)   # deterministic state rebuild
````

---

## 6  Security

* Passwords: bcrypt, 12 rounds.
* Session cookie: `Secure`, `HttpOnly`, `SameSite=Lax`.
* SQL-injection safe via SQLAlchemy ORM and bound parameters.

---

## 7  CI / CD

* **GitHub Actions** runs `pytest -q`, `flake8`, `mypy`.
* Docs auto-deployed to **GitHub Pages** on `main`.
* Dockerfile (future) will enable containerised deploys.

---

## 8  Extending timber

1. **New element type** → subclass `BaseElement`, implement `local_stiffness()`.
2. **Alternative DB** → swap SQLAlchemy URI; run `alembic upgrade`.
3. **Third-party UI frameworks** → the solver API is plain JSON; feel free to wrap with React/Vue/Svelte etc.

---

Happy building! For questions open an issue or join the discussions board.