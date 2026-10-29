"""Legacy entry point; use prepare_plus_results.py."""
from pathlib import Path
import runpy

if __name__ == "__main__":
    runpy.run_path(str(Path(__file__).with_name("prepare_plus_results.py")), run_name="__main__")
