"""Prepare artificial financial workbooks for browser tests, never company files."""
import sys
from pathlib import Path


def prepare(directory: Path):
    root = Path(__file__).resolve().parents[1]
    sys.path[:0] = [str(root/'apps/backend'), str(root/'tests')]
    from m1_fixtures import finance
    directory.mkdir(parents=True, exist_ok=True)
    for kind in ['profit', 'balance_sheet']:
        (directory/f'{kind}.xlsx').write_bytes(finance(kind))
    (directory/'profit_blank.xlsx').write_bytes(finance('profit', blank=True))
    return str(directory)
