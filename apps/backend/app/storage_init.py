"""Prepare only configured upload/backup directories for the unprivileged container."""

import os
from pathlib import Path

for variable, children in (("UPLOAD_ROOT", ("raw", "attachments", "followups")), ("BACKUP_ROOT", ())):
    root = Path(os.environ[variable])
    for directory in (root, *(root / child for child in children)):
        directory.mkdir(parents=True, exist_ok=True)
        os.chown(directory, 10001, 10001)
        directory.chmod(0o700)
    # 外部迁入的内容（tar 解包/跨机拷贝）可能带入错误属主，递归自愈保证 appuser(10001) 可读写。
    for path in root.rglob("*"):
        os.chown(path, 10001, 10001)
print("Storage directories prepared.")
