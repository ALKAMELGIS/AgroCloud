"""
Evaluate FTW field polygons against ground truth and optionally compare two runs.

Usage:
  python scripts/eval_ftw_baseline.py --pred baseline/polygons.geojson --gt gt.geojson
  python scripts/eval_ftw_baseline.py --pred improved.geojson --gt gt.geojson \\
      --baseline-metrics baseline/metrics.json --out-dir cache/ftw_eval/run1

Does not run inference — feed exported FTW GeoJSON (baseline then improved).
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from eval.field_boundary_metrics import (  # noqa: E402
    evaluate_field_boundaries,
    format_metrics_table,
)


def main() -> int:
    ap = argparse.ArgumentParser(description="FTW field boundary BASELINE vs IMPROVED metrics")
    ap.add_argument("--pred", required=True, help="Predicted polygons GeoJSON")
    ap.add_argument("--gt", required=True, help="Ground-truth polygons GeoJSON")
    ap.add_argument("--iou-thr", type=float, default=0.5)
    ap.add_argument("--boundary-buffer-m", type=float, default=5.0)
    ap.add_argument(
        "--baseline-metrics",
        default="",
        help="Optional prior metrics JSON to compare against (BASELINE vs IMPROVED)",
    )
    ap.add_argument("--out-dir", default="", help="Directory to write metrics.json + table.csv")
    ap.add_argument("--label", default="run", help="Label stored in metrics payload")
    args = ap.parse_args()

    metrics = evaluate_field_boundaries(
        args.pred,
        args.gt,
        iou_thr=args.iou_thr,
        boundary_buffer_m=args.boundary_buffer_m,
    )
    metrics["label"] = args.label
    metrics["pred"] = str(Path(args.pred).resolve())
    metrics["gt"] = str(Path(args.gt).resolve())
    metrics["evaluated_at"] = datetime.now(timezone.utc).isoformat()

    baseline = None
    if args.baseline_metrics:
        baseline = json.loads(Path(args.baseline_metrics).read_text(encoding="utf-8"))
        table = format_metrics_table(baseline, metrics)
        print("=== BASELINE vs IMPROVED ===")
        print(table)
    else:
        table = format_metrics_table(metrics)
        print("=== BASELINE ===")
        print(table)
        print("\nSave this run, then re-run with --baseline-metrics after geometry improvements.")

    if args.out_dir:
        out = Path(args.out_dir)
        out.mkdir(parents=True, exist_ok=True)
        (out / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
        (out / "table.csv").write_text(table + "\n", encoding="utf-8")
        print(f"\nWrote {out / 'metrics.json'}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
