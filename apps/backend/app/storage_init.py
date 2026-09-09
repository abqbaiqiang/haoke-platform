"""Prepare only configured upload/backup directories for the unprivileged container."""

import os
from pathlib import Path

for variable, children in (("UPLOAD_ROOT", ("raw", "attachments")), ("BACKUP_ROOT", ())):
    root = Path(os.environ[variable])
    for directory in (root, *(root / child for child in children)):
        directory.mkdir(parents=True, exist_ok=True)
        os.chown(directory, 10001, 10001)
        directory.chmod(0o700)
print("Storage directories prepared.")
