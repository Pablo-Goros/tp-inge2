"""Test-only process barrier: kill a real consumer at a persisted checkpoint."""
import sys
import time
from pathlib import Path

from app.entrypoints.worker import main
from app.infrastructure.registry_simulated import SimulatedRegistry

original_register = SimulatedRegistry.register


def checkpoint(self, cert_id, digest):
    if sys.argv[2] == "after_register":
        original_register(self, cert_id, digest)
    Path(sys.argv[1]).write_text(str(cert_id), encoding="utf-8")
    time.sleep(120)
    original_register(self, cert_id, digest)


SimulatedRegistry.register = checkpoint
main()
