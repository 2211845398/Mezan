"""One-off helper: print TypeScript map of CoA code -> Arabic label from seed."""
from app.services.coa_seed_data import iter_seed_nodes

pairs = sorted({n.code: n.name_ar for _, n in iter_seed_nodes()}.items())
print("/** Auto-synced from app/services/coa_seed_data.py — run scripts/gen_coa_ar_map.py to refresh */")
print("export const COA_SEED_AR_BY_CODE: Record<string, string> = {")
for code, ar in pairs:
    print(f"  '{code}': {ar!r},")
print("};")
