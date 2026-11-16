from hashlib import sha256
from uuid import uuid4

import pytest

from app.application.verification import verify_file
from app.domain.registry import RegistryUnavailable


class Registry:
    def __init__(self, value):
        self.value = value

    def lookup(self, cert_id):
        return self.value


def test_file_verification_compares_exact_bytes_against_registry():
    registry = Registry(sha256(b"original").hexdigest())
    assert verify_file(registry, uuid4(), b"original") == "VALID"
    assert verify_file(registry, uuid4(), b"originaX") == "ALTERED"
    assert verify_file(Registry(None), uuid4(), b"original") == "NOT_FOUND"


def test_unavailable_registry_is_not_invalid_or_absent():
    class Offline:
        def lookup(self, cert_id):
            raise RegistryUnavailable
    with pytest.raises(RegistryUnavailable):
        verify_file(Offline(), uuid4(), b"original")
