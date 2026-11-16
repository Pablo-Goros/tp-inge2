"""Deterministic demo faults, counted per worker process, never random."""
from dataclasses import dataclass, field

from app.domain.errors import PermanentError, TransientError
from app.domain.normalize import normalize_email


@dataclass
class FaultInjector:
    transient_remaining: int = 0
    permanent_emails: set[str] = field(default_factory=set)

    @classmethod
    def parse(cls, spec: str) -> "FaultInjector":
        injector = cls()
        seen_transient = False
        for item in spec.split(",") if spec.strip() else []:
            kind, separator, value = item.strip().partition(":")
            if kind == "transient" and separator and value.isdecimal() and not seen_transient:
                injector.transient_remaining = int(value)
                seen_transient = True
            elif kind == "permanent" and separator and "@" in value:
                injector.permanent_emails.add(normalize_email(value))
            else:
                raise ValueError("FAULT_INJECTION admite transient:n y permanent:email separados por comas")
        return injector

    def before_register(self, email: str) -> None:
        if normalize_email(email) in self.permanent_emails:
            raise PermanentError("Fallo permanente controlado de demo")
        if self.transient_remaining:
            self.transient_remaining -= 1
            raise TransientError("Fallo transitorio controlado de demo")
