"""Run the private-test gateway and API together in a hosted container."""
import os
import signal
import subprocess
import sys
import time


def main():
    if os.getenv('PUBLIC_TEST_ACCESS', '').lower() != 'true' and len(os.environ.get('PRIVATE_TEST_PASSWORD', '')) < 20:
        raise RuntimeError('PRIVATE_TEST_PASSWORD is required for hosted private tests.')
    children = []

    def stop(signum=None, frame=None):
        for child in children:
            if child.poll() is None:
                child.terminate()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        for module, port, extra in [('backend.main:app', '8017', []),
                                    ('backend.preview:create_preview', os.getenv('PORT', '8018'), ['--factory'])]:
            children.append(subprocess.Popen([sys.executable, '-m', 'uvicorn', module,
                            '--host', '0.0.0.0', '--port', port, '--no-access-log', *extra]))
        while all(child.poll() is None for child in children):
            time.sleep(.5)
    finally:
        stop()
        for child in children:
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
    return 1


if __name__ == '__main__':
    sys.exit(main())
