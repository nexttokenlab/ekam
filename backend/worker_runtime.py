"""Preserve worker failures and resource diagnostics in hosted deployment logs."""
import signal
import subprocess
import sys
from pathlib import Path


def resources():
    for name in ('memory.max', 'memory.peak', 'memory.events'):
        path = Path('/sys/fs/cgroup') / name
        if path.exists():
            print(f'worker {name}: {path.read_text().strip()}', flush=True)


def main():
    resources()
    child = subprocess.Popen([sys.executable, '-m', 'backend.agent', 'start'])
    stopping = False

    def stop(signum, frame):
        nonlocal stopping
        stopping = True
        child.send_signal(signum)

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    code = child.wait()
    resources()
    print(f'Voice worker exited with code {code}', flush=True)
    return 0 if stopping else (code or 1)


if __name__ == '__main__':
    sys.exit(main())
