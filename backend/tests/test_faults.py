import pytest

from app.application.faults import FaultInjector
from app.domain.errors import PermanentError, TransientError


def test_faults_are_deterministic_and_permanent_is_scoped_to_email():
    faults = FaultInjector.parse("transient:2,permanent:Alumno03@demo.test")
    with pytest.raises(PermanentError):
        faults.before_register("alumno03@demo.test")
    for _ in range(2):
        with pytest.raises(TransientError):
            faults.before_register("alumno01@demo.test")
    faults.before_register("alumno01@demo.test")
    with pytest.raises(PermanentError):
        faults.before_register("alumno03@demo.test")
    FaultInjector.parse("").before_register("alumno03@demo.test")


@pytest.mark.parametrize("spec", ["transient:-1", "transient:abc", "unknown:1", "permanent:",
                                     "transient:1,transient:2", "transient:2,"])
def test_invalid_fault_configuration_is_rejected(spec):
    with pytest.raises(ValueError):
        FaultInjector.parse(spec)
