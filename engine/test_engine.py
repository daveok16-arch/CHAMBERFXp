"""Engine tests (stdlib unittest): job queue + model registry round-trip."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import engine.jobs as jobs
import engine.model_registry as mr


class _DummyModel:
    def predict(self, x):
        return 1


class TestJobQueue(unittest.TestCase):
    def setUp(self):
        # fresh queue per test
        jobs.queue._lock.acquire()
        jobs.queue._jobs.clear()
        jobs.queue._queue.clear()
        jobs.queue._lock.release()

    def test_submit_and_complete(self):
        jid = jobs.queue.submit("test", lambda: {"ok": 1}, params={"a": 1})
        self.assertTrue(jid)
        # wait for completion
        job = None
        for _ in range(50):
            import time
            time.sleep(0.05)
            job = jobs.queue.get(jid)
            if job and job["status"] in ("done", "failed"):
                break
        self.assertEqual(job["status"], "done")
        self.assertEqual(job["result"], {"ok": 1})

    def test_failure_retries(self):
        calls = {"n": 0}
        def boom():
            calls["n"] += 1
            raise RuntimeError("boom")
        jid = jobs.queue.submit("test", boom, params={})
        job = None
        for _ in range(100):
            import time
            time.sleep(0.05)
            job = jobs.queue.get(jid)
            if job and job["status"] == "failed":
                break
        self.assertEqual(job["status"], "failed")
        self.assertIn("boom", job["error"])
        self.assertGreater(calls["n"], 1)  # retried


class TestModelRegistry(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.mkdtemp()
        self._old_dir = mr.MODELS_DIR
        self._old_latest = mr.LATEST_LINK
        self._old_meta = mr.METADATA_FILE
        mr.MODELS_DIR = self._tmp
        mr.LATEST_LINK = os.path.join(self._tmp, "latest")
        mr.METADATA_FILE = os.path.join(self._tmp, "latest_metadata.json")

    def tearDown(self):
        mr.MODELS_DIR = self._old_dir
        mr.LATEST_LINK = self._old_latest
        mr.METADATA_FILE = self._old_meta

    def test_save_load_roundtrip(self):
        mr.save_model(_DummyModel(), {
            "version": "v1",
            "accuracy": 0.7,
            "f1": 0.6,
            "class_balance": {"bull": 10, "bear": 5, "neutral": 3},
            "features": ["a", "b"],
        })
        info = mr.load_latest_model()
        self.assertEqual(info["version"], "v1")
        self.assertEqual(info["features"], ["a", "b"])
        latest = mr.latest_info()
        self.assertEqual(latest["version"], "v1")
        self.assertEqual(latest["accuracy"], 0.7)


if __name__ == "__main__":
    unittest.main()