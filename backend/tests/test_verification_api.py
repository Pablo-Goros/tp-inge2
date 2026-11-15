import datetime as dt
import uuid

from fastapi.testclient import TestClient
import pytest

from app.api.main import create_app
from app.api.verification import RegisteredCertificate, VerificationUnavailable, get_verification

CERT_ID = uuid.UUID('f4b70a9e-bede-41c3-a582-56e1270a2e19')


class Verification:
    def __init__(self, record=None, unavailable=False):
        self.record = record
        self.unavailable = unavailable

    def lookup(self, cert_id):
        if self.unavailable:
            raise VerificationUnavailable
        assert cert_id == CERT_ID
        return self.record


def public_client(service=None):
    app = create_app()
    if service is not None:
        app.dependency_overrides[get_verification] = lambda: service
    return TestClient(app)


def test_registered_certificate_exposes_only_public_fields():
    record = RegisteredCertificate(CERT_ID, 'Alumno', 'Institución', 'Curso', dt.date(2026, 1, 2))
    response = public_client(Verification(record)).get(f'/api/verify/{CERT_ID}')
    assert response.status_code == 200
    assert response.json() == {
        'status': 'REGISTERED', 'certificate_id': str(CERT_ID), 'student_name': 'Alumno',
        'institution': 'Institución', 'course_name': 'Curso', 'completion_date': '2026-01-02',
    }


def test_absent_registration_uses_common_error():
    response = public_client(Verification()).get(f'/api/verify/{CERT_ID}')
    assert response.status_code == 404
    assert response.json()['error']['code'] == 'NOT_FOUND'
    assert 'status' not in response.json()


@pytest.mark.parametrize('service', [None, Verification(unavailable=True)])
def test_unavailable_registration_is_never_absent(service):
    response = public_client(service).get(f'/api/verify/{CERT_ID}')
    assert response.status_code == 503
    assert response.json()['error']['code'] == 'UNAVAILABLE'


def test_invalid_public_identifier_uses_common_validation_error():
    response = public_client(Verification()).get('/api/verify/not-a-uuid')
    assert response.status_code == 400
    assert response.json()['error']['code'] == 'VALIDATION_ERROR'

def test_public_lookup_documents_uniform_errors_and_no_placeholder():
    operation = create_app().openapi()['paths']['/api/verify/{cert_id}']['get']
    assert set(operation['responses']) == {'200', '400', '404', '503'}
    assert operation.get('security', []) == []
