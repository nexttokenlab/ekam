"""Prepare secret-free Railway upload directories: python deploy/prepare.py OUTPUT."""
import shutil
import sys
from pathlib import Path

source = Path(__file__).resolve().parents[1]
destination = Path(sys.argv[1]).resolve()
for service, dockerfile in [('app', 'Dockerfile.api'), ('worker', 'Dockerfile.worker')]:
    output = destination / service
    if output.exists():
        raise SystemExit(f'Refusing to reuse existing directory: {output}')
    output.mkdir(parents=True)
    for name in ['src', 'public', 'backend']:
        shutil.copytree(source / name, output / name,
                        ignore=shutil.ignore_patterns('data', '__pycache__', '.pytest_cache', '*.pyc'))
    for name in ['package.json', 'package-lock.json', 'index.html', 'tsconfig.json',
                 'vite.config.ts', 'Dockerfile.api', 'Dockerfile.worker', '.dockerignore']:
        shutil.copy2(source / name, output / name)
    content = (source / dockerfile).read_text()
    if service == 'app':
        content = content[:content.rindex('CMD ')] + 'CMD ["python", "-m", "backend.hosted"]\n'
    (output / 'Dockerfile').write_text(content)
    shutil.copy2(source / 'deploy' / f'railway-{service}.json', output / 'railway.json')
    print(output)
