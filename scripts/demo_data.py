"""Write the deterministic demo dataset to a JSON file.

Usage: python scripts/demo_data.py [--out data/finance.json] [--seed 42]
"""
import argparse
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.demo import build_demo  # noqa: E402
from server.storage.json_repo import JsonRepository  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/finance.json")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--force", action="store_true", help="sobrescreve um arquivo existente")
    args = ap.parse_args()
    out = Path(args.out)
    if out.exists() and not args.force:
        sys.exit(f"{out} já existe. Use --force para substituir (pare o serviço antes, senão ele grava por cima).")
    repo = JsonRepository(out, out.parent / "backups")
    db = build_demo(today=date.today(), seed=args.seed)
    repo.replace_all(db)
    print(f"Demo gravado em {out} ({len(db.transactions)} lançamentos).")


if __name__ == "__main__":
    main()
