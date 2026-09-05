"""
In-process job queue for long-running engine work (train / backtest).
Single worker thread; each job runs to completion with retry-on-failure and
status tracking. No external broker required (keeps deploy lightweight).
"""
import threading
import time
import uuid
from typing import Callable, Dict, Any, Optional


class JobQueue:
    def __init__(self, max_retries: int = 2):
        self._queue: list[Dict[str, Any]] = []
        self._jobs: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()
        self._worker: Optional[threading.Thread] = None
        self._max_retries = max_retries

    def _run_loop(self):
        while True:
            with self._lock:
                if not self._queue:
                    return
                job_id = self._queue.pop(0)
                job = self._jobs[job_id]
            try:
                job["status"] = "running"
                job["started_at"] = time.time()
                result = self._run_job(job)
                job["result"] = result
                job["status"] = "done"
                job["finished_at"] = time.time()
            except Exception as e:
                job["attempts"] += 1
                if job["attempts"] <= self._max_retries:
                    job["status"] = "queued"
                    job["error"] = str(e)
                    with self._lock:
                        self._queue.append(job_id)
                else:
                    job["status"] = "failed"
                    job["error"] = str(e)
                    job["finished_at"] = time.time()

    def _run_job(self, job: Dict[str, Any]):
        # fn is stored on the job dict at submit time
        return job["_fn"]()

    def submit(self, kind: str, fn: Callable[[], Any], params: Optional[Dict[str, Any]] = None) -> str:
        job_id = uuid.uuid4().hex[:12]
        with self._lock:
            self._jobs[job_id] = {
                "id": job_id,
                "kind": kind,
                "status": "queued",
                "attempts": 0,
                "params": params or {},
                "result": None,
                "error": None,
                "created_at": time.time(),
                "started_at": None,
                "finished_at": None,
                "_fn": fn,
            }
            self._queue.append(job_id)
            if self._worker is None or not self._worker.is_alive():
                self._worker = threading.Thread(target=self._run_loop, daemon=True)
                self._worker.start()
        return job_id

    def get(self, job_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            return {k: v for k, v in job.items() if k != "_fn"}

    def list(self) -> list[Dict[str, Any]]:
        with self._lock:
            return [{k: v for k, v in j.items() if k != "_fn"} for j in self._jobs.values()]


queue = JobQueue()