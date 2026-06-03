# Mezan backend tests

## Default suite (CI and local gate)

Runs only **core** and **security** markers (~70 tests from a 247-item catalog):

```bash
export TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mezan_test
uv run pytest -v
```

| Marker | Focus |
|--------|--------|
| `core` | GL postings (VAT, shift variance, AP/AR), finalize rollbacks, COA/seed integrity |
| `security` | CORS, rate limits, route permission audit, bootstrap admin protection, auth |

## Run everything (including skipped legacy modules)

```bash
uv run pytest -v -m ""
```

## Run a single category

```bash
uv run pytest -v -m core
uv run pytest -v -m security
```

## Out of default CI

`tests/conftest.py` auto-skips legacy and volatile modules (HR/payroll, old PO variant flows, POS E2E, catalog combinatorics). Edit `_SKIP_LEGACY` / `_SKIP_VOLATILE` there when re-enabling a workflow.
