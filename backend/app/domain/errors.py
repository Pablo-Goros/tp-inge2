class TransientError(Exception):
    """A retryable issuance failure."""


class PermanentError(Exception):
    """A failure that cannot be fixed by redelivery."""
