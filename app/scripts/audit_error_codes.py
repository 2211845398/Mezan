"""List AppError raises in app/services that lack details['code'] for UI i18n.

Usage:
    python -m app.scripts.audit_error_codes

Exit code 1 when any raise is missing a stable code (for CI optional).
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

SERVICES = Path(__file__).resolve().parents[1] / "services"


def _details_has_code(node: ast.expr | None) -> bool:
    if node is None:
        return False
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
        for kw in node.keywords:
            if kw.arg == "details" and isinstance(kw.value, ast.Dict):
                for key, _ in zip(kw.value.keys, kw.value.values, strict=False):
                    if isinstance(key, ast.Constant) and key.value == "code":
                        return True
    return False


def _is_helper_raise(func: ast.expr | None) -> bool:
    if isinstance(func, ast.Name):
        return func.id in {
            "validation_error",
            "state_transition_error",
            "conflict_error",
            "not_found_error",
        }
    return False


def audit_file(path: Path) -> list[tuple[int, str]]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    issues: list[tuple[int, str]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Raise) or node.exc is None:
            continue
        exc = node.exc
        if isinstance(exc, ast.Call):
            if _is_helper_raise(exc.func):
                continue
            if isinstance(exc.func, ast.Name) and exc.func.id in {
                "ValidationError",
                "ConflictError",
                "StateTransitionError",
                "NotFoundError",
                "PermissionDeniedError",
            }:
                if not _details_has_code(exc):
                    msg = (
                        ast.get_source_segment(path.read_text(encoding="utf-8"), exc) or exc.func.id
                    )
                    issues.append((node.lineno, msg[:120]))
    return issues


def main() -> int:
    all_issues: list[tuple[Path, int, str]] = []
    for path in sorted(SERVICES.rglob("*.py")):
        for lineno, snippet in audit_file(path):
            all_issues.append((path.relative_to(SERVICES.parent), lineno, snippet))

    if not all_issues:
        print("All service raises use details['code'] or error helpers.")
        return 0

    print(f"Found {len(all_issues)} raise(s) without details['code']:\n")
    for path, lineno, snippet in all_issues[:80]:
        print(f"  {path}:{lineno}: {snippet}")
    if len(all_issues) > 80:
        print(f"  ... and {len(all_issues) - 80} more")
    return 1


if __name__ == "__main__":
    sys.exit(main())
