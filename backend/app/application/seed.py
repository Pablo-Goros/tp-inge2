from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.api.auth import hash_password
from app.config import get_settings
from app.infrastructure.models import Institution, User

INSTITUTION_NAME = "Instituto Demo"
OPERATOR_EMAIL = "operador@demo.test"
STUDENT_COUNT = 25


def _demo_users() -> list[tuple[str, str, str]]:
    users = [(OPERATOR_EMAIL, "Operador Demo", "operator")]
    users += [(f"alumno{i:02d}@demo.test", f"Alumno {i:02d}", "student") for i in range(1, STUDENT_COUNT + 1)]
    return users


def seed(session: Session, bcrypt_rounds: int = 12) -> None:
    """Datos de demo (contracts §8). Idempotente: no pisa usuarios existentes."""
    inst_id = session.scalar(select(Institution.id).where(Institution.name == INSTITUTION_NAME))
    if inst_id is None:  # institutions.name no es UNIQUE en el esquema
        inst_id = Institution(name=INSTITUTION_NAME)
        session.add(inst_id)
        session.flush()
        inst_id = inst_id.id
    existing = set(session.scalars(select(User.email)))
    password = get_settings().demo_password
    rows = [
        {"institution_id": inst_id, "email": email, "name": name, "role": role,
         "password_hash": hash_password(password, bcrypt_rounds)}
        for email, name, role in _demo_users() if email not in existing  # evita hashear de más
    ]
    if rows:
        session.execute(insert(User).values(rows).on_conflict_do_nothing(index_elements=["email"]))
    session.commit()
