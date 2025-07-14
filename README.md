# timber

_A single-page web application that lets **non-experts** solve and **visualise classical dynamics problems in 3-D**—yet is powerful enough for real-world structural design (think framing and tipping-up a timber barn)._

---

## Table of Contents
1. [Features](#features)
2. [Functional Requirements](#functional-requirements)
3. [Supported Use-Cases](#supported-use-cases)
4. [Data Model](#data-model)
5. [User Interface](#user-interface)
6. [Architecture & Technology](#architecture--technology)
7. [Quality & UX Guidelines](#quality--ux-guidelines)
8. [Quick Start](#quick-start)
9. [Contributing](#contributing)
10. [License](#license)

---

## Features
- 🌐 **One-page app** with responsive Bootstrap 5.3 UI.
- ⚙️ **Double-precision dynamics solver** (NumPy) — < 100 ms for textbook models.
- 👀 **True-scale 3-D canvas** with six orthographic thumbnails.
- 🔄 **Unit-aware UI** (metric ↔ imperial) while all math stays in SI base-units.
- 🗂 **Multi-sheet projects** saved per-user; every action is logged.
- 🔐 **User accounts** (Flask-Login + bcrypt) with session persistence in SQLite.
- 🚦 **Progress indicators** for any operation > 50 ms.
- 🧪 100 % typed Python, pytest-driven CI, Conventional Commits.
- ♿  Keyboard-navigable, ARIA-labelled controls.

---

## Functional Requirements

### 1  Calculation Engine

| Requirement | Notes |
|-------------|-------|
| **Canonical units** | All internal state is SI (m, kg, s, N, Pa, rad). Conversions occur only for display. |
| **Numerical accuracy** | Double precision; robust to singular matrices, near-collinear members, zero-length vectors. |
| **Performance** | < 100 ms on consumer hardware; caches reused sub-matrices. |
| **Extensibility** | Each element type is an OO class; new materials/elements plug-in cleanly. |
| **Edge cases** | Validates duplicates, bad BCs, unbalanced systems, etc., and raises clear JSON errors. |

### 1.2  Visualisation

* Six orthographic views: **+X, –X, +Y, –Y, +Z, –Z** (one is “Home”).
* Geometric scale is always faithful—no “lost in space” starts.
* Every displayed number shows a unit suffix (e.g. `4.50 kN`).
* Show spinner/progress bar for actions > 50 ms.

---

## Supported Use-Cases
* Solve any first-year dynamics textbook problem _without prior dynamics knowledge_.
* Model a barn wall from 2 × 4 lumber, then compute the forces to **tip-up** the assembly.
* Iterate on 3-D assemblies of joints, beams, and plates.

---

## Data Model

| Element | Dim. | Description | Core Properties * |
|---------|------|-------------|-------------------|
| **Joint** | 0-D | Mass-less node; connection point for other elements | position (x y z) |
| **Member** | 1-D | Prismatic truss/beam element | mass, x y z, θx θy θz |
| **Load** | — | Force + moment on point/edge/face | Fx Fy Fz, Mx My Mz |
| **Support** | — | Boundary condition | type (fixed, pinned, roller, ball, custom), stiffness |

\*Rotations = rad; positions = m; mass = kg.

---


## User Interface

```

┌───────────────────────────────┐───────────────┬
│            Canvas             │  Properties   │
│         (left pane)           │ (right pane)  │
└───────────────────────────────┘───────────────┴

````

### Canvas Tools
* Zoom ± (mouse-wheel & buttons) • Add / Delete / Select element  
* Home view reset • Six orthographic thumbnails

### Properties Pane

| Group | Fields |
|-------|--------|
| **Element** | Context-sensitive attrs + load table |
| **Global** | Gravity **g** (default = 9.807 m s⁻²); units toggle (Metric ↔ Imperial) |
| **View** | Camera position (x y z), target, zoom (live-update) |

Inline validation reverts invalid entries.

---

## Architecture & Technology

| Layer | Tech / Package | Key Points |
|-------|----------------|-----------|
| **Frontend** | Bootstrap 5.3, vanilla JS, Jinja2 templates (`header.html`, `body.html`) | One route `/` (SPA), 768 px + responsive |
| **Backend** | Flask 2.x | REST JSON endpoints (`/solve`, `/sheet/*`, `/auth/*`) |
| **Solver Core** | NumPy | Matrix assembly, LU solve |
| **Persistence** | SQLite 3 via SQLAlchemy | Tables: `users`, `sheets`, `elements`, `actions` |
| **Auth** | Flask-Login + bcrypt | Secure password hashing |
| **Testing** | pytest, coverage | CI GitHub Actions |
| **Docs** | MkDocs | Published to GitHub Pages |

---

## Quality & UX Guidelines
* 100 % PEP 484 typing; `flake8`, `black`, `isort`.
* No silent failures—numeric/geometry issues surface in a dismissible alert.
* Accessibility: keyboard-friendly, ARIA labels, colour-safe palette.

---

## Quick Start

```bash
# 1 · Clone & set up Python
git clone https://github.com/yourname/timber.git
cd timber
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt  # installs Flask, NumPy, SQLAlchemy, bcrypt, etc.

# 2 · Configure environment (once per shell)
export FLASK_APP=src/app.py
export FLASK_ENV=development

# 3 · Run database migrations
flask db init
flask db migrate
flask db upgrade

# 4 · Boot dev server
flask run
````

Open [http://127.0.0.1:5000](http://127.0.0.1:5000), register a user, create a sheet, and start modelling.

> **Running tests**

```bash
pytest -q
```

> **Lint & format**

```bash
make lint   # flake8 + mypy
make fmt    # black + isort
```

### Basic Calculation Example

```python
from timber import Joint, Member, Load, Support, Model, solve

model = Model(
    joints=[Joint(0.0, 0.0), Joint(2.0, 0.0)],
    members=[Member(start=0, end=1, E=210e9, A=0.01, I=8.333e-6)],
    loads=[Load(joint=1, fy=-1000.0)],
    supports=[Support(joint=0, ux=True, uy=True, rz=True)],
)
results = solve(model)
print(results.displacements[1][1])  # tip deflection (m)
```

---

## Contributing

Please read **CONTRIBUTING.md** and **CODE\_OF\_CONDUCT.md**.
All changes must:

1. Pass lint & tests,
2. Follow Conventional Commits,
3. Receive approval from a **CODEOWNER**.

---

## License

© 2025 — MIT License (see LICENSE).

````

---

### `docs/index.md`

```markdown
# timber Documentation

Welcome to the complete reference for **timber**—the one-page dynamics solver and visualiser.

| Section | Purpose |
|---------|---------|
| **[Architecture](architecture.md)** | Deep dive into layers, modules, database schema, and dependencies. |
| **User Guide** | (coming soon) step-by-step tutorials and FAQ. |
| **API Reference** | Auto-generated endpoints & types. |

---

## Key Capabilities

* **Instant 3-D feedback** for joints, members, and plates.
* **Metric / Imperial** toggle without corrupting internal SI precision.
* **Multi-sheet projects** stored per-user; every click is persisted and replay-able.
* **Robust solver**—double precision, edge-case aware, extensible element classes.
* **Accessible UI** with full keyboard coverage and ARIA roles.

---

## How It Works (High-level)

1. **You sketch** elements in the browser.  
2. The UI packs them into a validated JSON payload.  
3. Flask receives `/solve`, feeds NumPy, returns forces/stresses.  
4. Results are drawn in the canvas and logged to SQLite—alongside a timestamp, user ID, and sheet ID—for later replay.

For a code-oriented walk-through see **[architecture.md](architecture.md)**.