"""AI advisory services (Epic 14).

All advisory services in this package follow the same deterministic-facts
pattern already established by ``marketing_advisory_service``:

1. Gather facts from the DB with plain SQL (no LLM involved).
2. Build a fixed system prompt + a structured facts payload.
3. Call the configured LLM with ``response_format=json_object`` and a
   conservative temperature.
4. Validate the response against a Pydantic schema.
5. Fall back to a deterministic rule-based answer if the LLM is unavailable
   or returns an invalid payload.

This keeps cost predictable (facts are trimmed before they hit the model),
keeps the LLM's freedom narrow (schema-constrained output), and keeps the
product usable even when the API key is missing.
"""
