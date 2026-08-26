import sys
from pathlib import Path

import pytest

from engine.data import DataRepo

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


@pytest.fixture()
def repo() -> DataRepo:
    return DataRepo()
