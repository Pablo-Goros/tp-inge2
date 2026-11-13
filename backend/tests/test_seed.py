import bcrypt
from sqlalchemy import func, select

from app.application.seed import seed
from app.infrastructure.models import Institution, User


def _seed(session):
    seed(session, bcrypt_rounds=4)


def test_seed_creates_one_institution_one_operator_25_students(session):
    _seed(session)
    assert session.scalar(select(func.count()).select_from(Institution)) == 1
    ops = session.scalars(select(User).where(User.role == "operator")).all()
    assert [u.email for u in ops] == ["operador@demo.test"]
    studs = session.scalars(select(User).where(User.role == "student").order_by(User.email)).all()
    assert [u.email for u in studs] == [f"alumno{i:02d}@demo.test" for i in range(1, 26)]
    assert studs[0].name == "Alumno 01"


def test_seed_twice_does_not_duplicate(session):
    _seed(session)
    before = {u.email: u.password_hash for u in session.scalars(select(User))}
    _seed(session)
    assert session.scalar(select(func.count()).select_from(User)) == 26
    assert session.scalar(select(func.count()).select_from(Institution)) == 1
    session.expire_all()
    assert {u.email: u.password_hash for u in session.scalars(select(User))} == before


def test_seed_passwords_are_hashed_not_plaintext(session):
    from app.config import get_settings

    _seed(session)
    u = session.scalar(select(User).where(User.email == "alumno01@demo.test"))
    assert u.password_hash != get_settings().demo_password
    assert bcrypt.checkpw(get_settings().demo_password.encode(), u.password_hash.encode())
