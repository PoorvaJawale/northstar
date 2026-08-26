import os
import sys
from pathlib import Path

# ensure MOCK mode for tests and put repo root on the path
os.environ.setdefault("SATQUERY_MOCK", "1")
os.environ.setdefault("SATQUERY_USE_LLM", "0")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
