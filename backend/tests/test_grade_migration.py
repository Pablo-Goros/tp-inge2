"""Migration exercised against the dedicated PostgreSQL test schema only."""
import os
import uuid

from alembic import command
from alembic.config import Config
from sqlalchemy import text

from tests._safety import require_test_db
from tests.conftest import BACKEND_DIR


def test_optional_grade_migration_preserves_existing_request_and_pdf(engine):
    require_test_db()
    cfg = Config(os.path.join(BACKEND_DIR, 'alembic.ini'))
    cfg.set_main_option('script_location', os.path.join(BACKEND_DIR, 'migrations'))
    inst, operator, student, batch, request = [uuid.uuid4() for _ in range(5)]
    try:
        command.downgrade(cfg, '0002')
        with engine.begin() as conn:
            conn.execute(text('INSERT INTO institutions (id,name) VALUES (:id,\'Previous\')'), {'id': inst})
            for uid, role in [(operator, 'operator'), (student, 'student')]:
                conn.execute(text('INSERT INTO users (id,institution_id,email,name,password_hash,role) '
                                  'VALUES (:id,:inst,:email,\'Previous\',\'hash\',:role)'),
                             {'id': uid, 'inst': inst, 'email': f'{uid}@test.example', 'role': role})
            conn.execute(text("INSERT INTO batches (id,operator_id,course_name,completion_date,idempotency_key,request_fingerprint) "
                              "VALUES (:id,:operator,'Previous','2026-10-30','previous','fingerprint')"),
                         {'id': batch, 'operator': operator})
            conn.execute(text("INSERT INTO cert_requests (id,batch_id,student_id,course_key,completion_date,status) "
                              "VALUES (:id,:batch,:student,'previous','2026-10-30','ISSUED')"),
                         {'id': request, 'batch': batch, 'student': student})
            conn.execute(text("INSERT INTO certificates (request_id,pdf,sha256) VALUES (:id,:pdf,'previous-hash')"),
                         {'id': request, 'pdf': b'previous PDF bytes'})
        command.upgrade(cfg, 'head')
        with engine.connect() as conn:
            row = conn.execute(text('SELECT r.final_grade,c.pdf,c.sha256 FROM cert_requests r '
                                    'JOIN certificates c ON c.request_id=r.id WHERE r.id=:id'), {'id': request}).one()
            assert row == (None, b'previous PDF bytes', 'previous-hash')
        command.upgrade(cfg, 'head')
    finally:
        command.upgrade(cfg, 'head')
        with engine.begin() as conn:
            conn.execute(text('TRUNCATE institutions CASCADE'))
