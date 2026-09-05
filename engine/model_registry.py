"""
Versioned model registry: stores trained ensemble models as pickled artifacts
plus metadata JSON so the engine can serve the latest model deterministically
and fall back to a previous version if loading fails.
"""
import os
import json
import time
import shutil
import pickle
from typing import Dict, Any, Optional

MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
LATEST_LINK = os.path.join(MODELS_DIR, "latest")
METADATA_FILE = os.path.join(MODELS_DIR, "latest_metadata.json")


def _ensure_dir() -> None:
    os.makedirs(MODELS_DIR, exist_ok=True)


def list_models() -> list[Dict[str, Any]]:
    _ensure_dir()
    result = []
    for name in sorted(os.listdir(MODELS_DIR), reverse=True):
        if not name.startswith("model_") or not name.endswith(".pkl"):
            continue
        meta_path = os.path.join(MODELS_DIR, name.replace(".pkl", ".json"))
        meta = {}
        if os.path.exists(meta_path):
            try:
                meta = json.load(open(meta_path, encoding="utf-8"))
            except Exception:
                meta = {"error": "unreadable"}
        result.append({"artifact": name, **meta})
    return result


def save_model(model, metadata: Dict[str, Any]) -> Dict[str, Any]:
    """Persists the model under a versioned name and updates the latest link."""
    _ensure_dir()
    version = metadata.get("version") or str(int(time.time()))
    artifact = f"model_{version}.pkl"
    meta_file = f"model_{version}.json"

    artifact_path = os.path.join(MODELS_DIR, artifact)
    with open(artifact_path, "wb") as f:
        pickle.dump({"model": model, "features": metadata.get("features", [])}, f)

    meta = {
        "version": version,
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "accuracy": metadata.get("accuracy"),
        "f1": metadata.get("f1"),
        "class_balance": metadata.get("class_balance"),
        "features": metadata.get("features", []),
    }
    meta_path = os.path.join(MODELS_DIR, meta_file)
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    # latest link (plain text pointing at artifact name)
    with open(LATEST_LINK, "w", encoding="utf-8") as f:
        f.write(artifact)
    shutil.copy(meta_path, METADATA_FILE)
    return meta


def load_latest_model() -> Dict[str, Any]:
    """Returns {'model': <obj>, 'features': [...], 'version': str} or raises."""
    _ensure_dir()
    artifact = None
    if os.path.exists(LATEST_LINK):
        try:
            artifact = open(LATEST_LINK, encoding="utf-8").read().strip()
        except Exception:
            artifact = None
    if not artifact or not os.path.exists(os.path.join(MODELS_DIR, artifact)):
        # fall back to newest artifact
        names = [n for n in os.listdir(MODELS_DIR) if n.startswith("model_") and n.endswith(".pkl")]
        if not names:
            raise FileNotFoundError("No trained model in registry")
        artifact = sorted(names, reverse=True)[0]

    with open(os.path.join(MODELS_DIR, artifact), "rb") as f:
        data = pickle.load(f)
    version = artifact.replace("model_", "").replace(".pkl", "")
    return {
        "model": data.get("model"),
        "features": data.get("features", []),
        "version": version,
    }


def latest_info() -> Optional[Dict[str, Any]]:
    try:
        info = load_latest_model()
        meta = {}
        if os.path.exists(METADATA_FILE):
            try:
                with open(METADATA_FILE, encoding="utf-8") as f:
                    meta = json.load(f)
            except Exception:
                pass
        return {"version": info["version"], "features": info["features"], **meta}
    except FileNotFoundError:
        return None