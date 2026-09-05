"""
Supervised engine worker: runs the trading-bot orchestrator (main.py) in a
managed subprocess with automatic restart on crash, heartbeat health, and
graceful stop. Replaces the fire-and-forget spawn in server.ts.
"""
import os
import sys
import time
import signal
import subprocess
import threading
from typing import Optional

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class SupervisedWorker:
    def __init__(self, max_ticks: int = 20, restart_delay: float = 3.0):
        self.max_ticks = max_ticks
        self.restart_delay = restart_delay
        self.proc: Optional[subprocess.Popen] = None
        self.running = False
        self.thread: Optional[threading.Thread] = None
        self.started_at: Optional[float] = None
        self.restart_count = 0
        self.last_lines: list[str] = []

    def _tap(self, line: str) -> None:
        self.last_lines.append(line)
        if len(self.last_lines) > 150:
            self.last_lines = self.last_lines[-150:]

    def start(self) -> None:
        if self.running:
            return
        self.running = True
        self.started_at = time.time()
        self.thread = threading.Thread(target=self._supervise, daemon=True)
        self.thread.start()

    def _supervise(self) -> None:
        while self.running:
            try:
                env = dict(os.environ)
                env["PYTHONUNBUFFERED"] = "1"
                self.proc = subprocess.Popen(
                    [sys.executable, "main.py"],
                    cwd=REPO_ROOT,
                    env=env,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                )
                for line in self.proc.stdout:
                    self._tap(line.rstrip())
            except Exception as e:
                self._tap(f"[worker] spawn error: {e}")

            if not self.running:
                break
            code = self.proc.poll() if self.proc else 1
            self._tap(f"[worker] process exited code={code}")
            if not self.running:
                break
            self.restart_count += 1
            time.sleep(self.restart_delay)  # restart after crash/exit

    def stop(self) -> None:
        if not self.running:
            # ensure a lingering child is reaped anyway
            if self.proc and self.proc.poll() is None:
                try:
                    self.proc.send_signal(signal.SIGINT)
                    self.proc.wait(timeout=5)
                except Exception:
                    pass
            return
        self.running = False
        if self.proc and self.proc.poll() is None:
            try:
                self.proc.send_signal(signal.SIGINT)
                try:
                    self.proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.proc.kill()
                    self.proc.wait(timeout=3)
            except Exception:
                pass

    def status(self) -> dict:
        return {
            "running": self.running,
            "procAlive": bool(self.proc and self.proc.poll() is None),
            "restartCount": self.restart_count,
            "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(self.started_at)) if self.started_at else None,
            "uptimeSec": int(time.time() - self.started_at) if self.started_at else 0,
            "logs": self.last_lines[-50:],
        }


worker = SupervisedWorker()