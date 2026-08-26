"""Regenerates golden snapshots. Review diffs before committing."""
import subprocess
import sys
from pathlib import Path

if __name__ == "__main__":
    for f in Path("backend/tests/golden").glob("*.json"):
        f.unlink()
    raise SystemExit(subprocess.call([sys.executable, "-m", "pytest",
                                     "tests/test_baseline.py::test_golden_snapshots"],
                                    cwd="backend"))
