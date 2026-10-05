import base64
import httpx
from fastapi.testclient import TestClient
from backend.preview import create_preview

def test_private_preview_requires_password_and_hides_worker_api():
    seen=[]
    def upstream(request):
        seen.append(request)
        return httpx.Response(200, json={'ok':True}, headers={'set-cookie':'session=test; HttpOnly; Secure'})
    password='test-only-password-123456789'
    app=create_preview(password, httpx.MockTransport(upstream))
    auth='Basic '+base64.b64encode(f'tester:{password}'.encode()).decode()
    with TestClient(app) as c:
        assert c.get('/').status_code == 401
        assert c.get('/api/auth/otp',headers={'Authorization':'Basic broken'}).status_code == 401
        assert not seen
        assert c.get('/api/internal/sessions/test',headers={'Authorization':auth}).status_code == 403
        response=c.post('/api/auth/otp',headers={'Authorization':auth},json={'phone':'+919000000001'})
        assert response.status_code == 200
        assert 'authorization' not in seen[0].headers
        assert response.headers['set-cookie'] == 'session=test; HttpOnly; Secure'
        assert response.headers['cache-control'] == 'no-store'

def test_public_test_access_preserves_internal_block_and_secure_cookies(monkeypatch):
    monkeypatch.setenv('PUBLIC_TEST_ACCESS', 'true')
    seen = []
    def upstream(request):
        seen.append(request)
        return httpx.Response(200, text='Ekam', headers={'set-cookie': 'session=test; HttpOnly'})
    with TestClient(create_preview('', httpx.MockTransport(upstream))) as c:
        response = c.get('/')
        assert response.status_code == 200
        assert 'www-authenticate' not in response.headers
        assert response.headers['set-cookie'].endswith('; Secure')
        assert c.get('/api/internal/sessions/test').status_code == 403
        assert len(seen) == 1

def test_gateway_never_borrows_another_visitors_cookie(monkeypatch):
    monkeypatch.setenv('PUBLIC_TEST_ACCESS', 'true')
    seen = []
    def upstream(request):
        cookie = request.headers.get('cookie', '')
        seen.append(cookie)
        if request.url.path == '/api/auth/verify':
            return httpx.Response(200, json={'id':'owner'}, headers={'set-cookie':'talkeasy_session=owner; HttpOnly; Path=/'})
        return httpx.Response(200 if cookie else 401, json={'cookie':cookie})
    app = create_preview('', httpx.MockTransport(upstream))
    with TestClient(app, base_url='https://testserver') as owner:
        guest = TestClient(app, base_url='https://testserver')
        owner.post('/api/auth/verify')
        assert owner.get('/api/me').json()['cookie'] == 'talkeasy_session=owner'
        assert guest.get('/?connect=qr-only').status_code == 401
        assert guest.get('/api/me').status_code == 401
        guest.cookies.set('talkeasy_session', 'guest')
        assert guest.get('/api/me').json()['cookie'] == 'talkeasy_session=guest'
        assert owner.get('/api/me').json()['cookie'] == 'talkeasy_session=owner'
        guest.close()
