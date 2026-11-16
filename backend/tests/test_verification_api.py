import datetime as dt
import uuid

from fastapi.testclient import TestClient
import pytest

from app.api.main import create_app
from app.api.verification import RegisteredCertificate, UnavailableVerification, VerificationUnavailable, get_verification

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
    # Isolated HTTP tests explicitly replace C; production now uses the real registry.
    app.dependency_overrides[get_verification] = lambda: service if service is not None else UnavailableVerification()
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

def test_matching_uploaded_bytes_are_valid_without_authentication():
    class FileVerification:
        def compare_file(self, cert_id, content):
            assert cert_id == CERT_ID
            assert content == b'%PDF-received'
            return 'VALID'
    response = public_client(FileVerification()).post(
        f'/api/verify/{CERT_ID}/file', files={'file': ('document.txt', b'%PDF-received', 'text/plain')},
    )
    assert response.status_code == 200
    assert response.json() == {'result': 'VALID'}

def test_uploaded_file_one_byte_over_limit_is_rejected_before_verification():
    response = public_client().post(f'/api/verify/{CERT_ID}/file',
                                   files={'file': ('large.pdf', b'x' * (5_242_880 + 1))})
    assert response.status_code == 400
    assert response.json()['error']['code'] == 'VALIDATION_ERROR'

@pytest.mark.parametrize('result', ['ALTERED', 'NOT_FOUND'])
def test_file_comparison_preserves_case_of_use_result(result):
    class FileVerification:
        def compare_file(self, cert_id, content):
            return result
    response = public_client(FileVerification()).post(f'/api/verify/{CERT_ID}/file',
                                                     files={'file': ('x', b'changed')})
    assert response.status_code == 200
    assert response.json() == {'result': result}


def test_exact_upload_limit_is_accepted():
    class FileVerification:
        def compare_file(self, cert_id, content):
            assert len(content) == 5_242_880
            return 'VALID'
    response = public_client(FileVerification()).post(f'/api/verify/{CERT_ID}/file',
                                                     files={'file': ('x', b'x' * 5_242_880)})
    assert response.status_code == 200
    assert response.json() == {'result': 'VALID'}


@pytest.mark.parametrize('service', [None])
def test_missing_verification_integration_returns_unavailable_for_upload(service):
    response = public_client(service).post(f'/api/verify/{CERT_ID}/file', files={'file': ('x', b'x')})
    assert response.status_code == 503
    assert response.json()['error']['code'] == 'UNAVAILABLE'


def test_registry_failure_returns_unavailable_for_upload():
    class FileVerification:
        def compare_file(self, cert_id, content):
            raise VerificationUnavailable
    response = public_client(FileVerification()).post(f'/api/verify/{CERT_ID}/file', files={'file': ('x', b'x')})
    assert response.status_code == 503
    assert response.json()['error']['code'] == 'UNAVAILABLE'


@pytest.mark.parametrize('path,files', [('/api/verify/not-a-uuid/file', {'file': ('x', b'x')}),
                                        (f'/api/verify/{CERT_ID}/file', None)])
def test_invalid_file_form_uses_common_validation_error(path, files):
    response = public_client().post(path, files=files)
    assert response.status_code == 400
    assert response.json()['error']['code'] == 'VALIDATION_ERROR'


def test_file_verification_openapi_has_no_placeholder():
    operation = create_app().openapi()['paths']['/api/verify/{cert_id}/file']['post']
    assert set(operation['responses']) == {'200', '400', '404', '503'}
    assert operation.get('security', []) == []


def test_file_verification_openapi_describes_exact_limit_and_authenticity():
    schema = create_app().openapi()
    body = schema['paths']['/api/verify/{cert_id}/file']['post']['requestBody']['content']['multipart/form-data']['schema']
    properties = schema['components']['schemas'][body['$ref'].split('/')[-1]]['properties']
    description = properties['file'].get('description', '')
    assert '5.242.880 bytes' in description
    assert 'MIME' in description and 'autenticidad' in description
