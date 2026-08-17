"""Ad-hoc timing probe: run the same ftw-live AOI twice and print stage timings."""

from __future__ import annotations

import sys
import time

BBOX = [float(v) for v in (sys.argv[1:5] or ["54.30", "24.30", "54.36", "24.36"])]


def main() -> None:
    from ftw_live import run_ftw_live

    for attempt in (1, 2):
        marks: list[tuple[str, float]] = []
        t0 = time.time()
        out = run_ftw_live(
            BBOX,
            year=2024,
            min_area_m2=500.0,
            progress=lambda pct, stage: marks.append((stage, time.time() - t0)),
        )
        total = time.time() - t0
        print(
            f"run {attempt}: {total:.1f}s  fields={out['count']}  "
            f"cache={out.get('cache')}  downscale={out.get('stack_downscale')}"
        )
        prev = 0.0
        for stage, at in marks:
            print(f"    {stage:<16} +{at - prev:6.1f}s")
            prev = at


if __name__ == "__main__":
    main()
