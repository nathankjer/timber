# Contributing to timber

Thanks for taking the time to contribute!  
Whether you are a human developer or an AI agent, please follow the workflow below.

## 1 – Set-up

```bash
git clone https://github.com/yourname/timber.git
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pre-commit install            # hooks: black, isort, flake8, mypy
````

> Codex tip: run `pytest -q` before every commit to keep CI green.

## 2 – Branching & commits

| Step          | Command                                                 | Notes                                                    |
| ------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| Create branch | `git checkout -b feat/short-description`                | Use **kebab-case** prefixes (`feat/`, `fix/`, `docs/`…). |
| Commit        | `git commit -m "feat(ui): add orthographic thumbnails"` | Follow the [Conventional Commits spec]().                |

Every commit triggers CI; keep history clean with `git rebase -i` before pushing.

## 3 – Tests & lint

* Unit tests: `pytest -q`
* Static typing: `mypy .`
* Style: `flake8` + `black --check`

CI will run the same commands. Push fixes until the badge is green.

## 4 – Pull-request checklist

1. **Add/adjust tests** for any new logic.
2. **Update docs** (`README.md` or `docs/`) if behaviour changes.
3. `make fmt && make lint && pytest -q` must pass locally.
4. One **CODEOWNER** must approve before merge.

> Large diff? Mark “draft” so reviewers (and Codex) know it’s WIP.

## 5 – Code of Conduct

By participating you agree to abide by the [Contributor Covenant](CODE_OF_CONDUCT.md).