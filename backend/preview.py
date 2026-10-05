"""Test gateway with optional shared password and blocked internal routes."""
import base64
import binascii
import hmac
import os
import posixpath
from contextlib import asynccontextmanager

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response

load_dotenv('.env.local')


def create_preview(password=None, transport=None):
    password = password if password is not None else os.getenv('PRIVATE_TEST_PASSWORD', '')
    public_access = os.getenv('PUBLIC_TEST_ACCESS', '').lower() == 'true'
    if not public_access and len(password) < 20:
        raise RuntimeError('Set PRIVATE_TEST_PASSWORD to a random value of at least 20 characters.')

    @asynccontextmanager
    async def lifespan(app):
        async with httpx.AsyncClient(base_url='http://127.0.0.1:8017', transport=transport,
                                     timeout=30, follow_redirects=False) as client:
            app.state.client = client
            yield

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    @app.api_route('/{path:path}', methods=['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'])
    async def proxy(path: str, request: Request):
        try:
            scheme, value = request.headers.get('authorization', '').split(' ', 1)
            decoded = base64.b64decode(value, validate=True)
            valid = scheme.lower() == 'basic' and hmac.compare_digest(decoded, f'tester:{password}'.encode())
        except (ValueError, binascii.Error):
            valid = False
        if not public_access and not valid:
            return Response('Private Ekam test. Enter the shared tester credentials.', status_code=401,
                            headers={'WWW-Authenticate': 'Basic realm="Ekam private test", charset="UTF-8"',
                                     'Cache-Control': 'no-store'})
        # Internal worker APIs must remain local, even for authenticated testers.
        if posixpath.normpath('/' + path).lstrip('/').startswith('api/internal'):
            return Response('Not available through the test gateway.', status_code=403)
        excluded = {'host', 'authorization', 'connection', 'content-length', 'transfer-encoding',
                    'forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto'}
        headers = {k:v for k,v in request.headers.items() if k.lower() not in excluded}
        url = 'http://127.0.0.1:8017/' + path
        if request.url.query:
            url += '?' + request.url.query
        try:
            # Build a raw request: AsyncClient.request/build_request would merge
            # its shared cookie jar and leak a previous visitor's authentication.
            upstream = await app.state.client.send(httpx.Request(request.method, url, headers=headers, content=await request.body()))
        except httpx.HTTPError:
            return Response('Ekam is restarting. Please try again shortly.', status_code=503)
        response = Response(upstream.content, status_code=upstream.status_code)
        response.raw_headers = [(k,v) for k,v in upstream.headers.raw
                                if k.lower() not in (b'content-length', b'content-encoding', b'transfer-encoding', b'connection', b'cache-control')]
        response.raw_headers = [(k, v + b'; Secure' if k.lower() == b'set-cookie' and b'; secure' not in v.lower() else v)
                                for k,v in response.raw_headers]
        response.headers['Cache-Control'] = 'no-store'
        return response

    return app
