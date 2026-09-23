"""Poll Cloudflare over outbound HTTPS and run jobs on the local face API."""
from __future__ import annotations

import os
import socket
import time
import requests

QUEUE_URL = os.environ["IM_KING_QUEUE_URL"].rstrip("/")
SECRET = os.environ["IM_KING_WORKER_SECRET"]
LOCAL_API = os.environ.get("IM_KING_LOCAL_API", "http://127.0.0.1:8001/api/v1/matches")
HEADERS = {"Authorization": f"Bearer {SECRET}"}
SINGLETON_PORT = 47821
ADMIN_API = LOCAL_API.rsplit('/matches', 1)[0] + '/admin/dataset'
IMPORT_TYPE = 'application/vnd.lookalike.dataset+json'

def sync_dataset():
    cursor = ''
    while True:
        response = requests.get(QUEUE_URL+'/worker/dataset', headers=HEADERS, params={'after':cursor}, timeout=30)
        response.raise_for_status()
        page = response.json()
        for record in page['records']:
            requests.post(ADMIN_API+'/apply', headers=HEADERS, json={'record':record}, timeout=30).raise_for_status()
        cursor = page.get('next')
        if not cursor: return


def post(path: str, timeout: int = 20, **kwargs):
    headers = {**HEADERS, **kwargs.pop("headers", {})}
    return requests.post(f"{QUEUE_URL}{path}", headers=headers, timeout=timeout, **kwargs)


def main():
    singleton = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        singleton.bind(("127.0.0.1", SINGLETON_PORT))
        singleton.listen(1)
    except OSError:
        print("queue worker already running; exiting duplicate", flush=True)
        return
    print(f"queue worker ready: {QUEUE_URL}", flush=True)
    synced_at = 0
    while True:
        job_id = None
        try:
            if time.monotonic()-synced_at > 60:
                synced_at = time.monotonic()
                try:
                    sync_dataset()
                except requests.RequestException as exc:
                    print(f'dataset sync will retry ({type(exc).__name__})', flush=True)
            claim = post("/worker/claim", timeout=12)
            if claim.status_code == 204:
                time.sleep(2.0)
                continue
            claim.raise_for_status()
            job_id = claim.json()["id"]
            image = requests.get(f"{QUEUE_URL}/worker/input/{job_id}", headers=HEADERS, timeout=30)
            image.raise_for_status()
            importing = image.headers.get('Content-Type') == IMPORT_TYPE
            if importing:
                result = requests.post(ADMIN_API+'/from-url',headers=HEADERS,json=image.json(),timeout=120)
            else:
                result = requests.post(LOCAL_API, data={'match_gender':image.headers.get('X-Match-Gender','auto')}, files={"image": ("face.jpg", image.content, image.headers.get("Content-Type", "image/jpeg"))}, timeout=120)
            if result.ok:
                payload = result.json()
                if importing:
                    post('/worker/dataset/publish', timeout=30, json=payload).raise_for_status()
                    applied=requests.post(ADMIN_API+'/apply',headers=HEADERS,json={'record':payload['record']},timeout=30)
                    applied.raise_for_status()
                    payload={'ok':True,'item':payload['record']['item'],'detail_url':'/detail?id='+payload['record']['item']['id']}
                post(f"/worker/complete/{job_id}", timeout=20, json=payload).raise_for_status()
                print(f"job complete: {job_id}", flush=True)
            else:
                try:
                    detail = result.json().get("detail", "분석에 실패했습니다.")
                except ValueError:
                    detail = f"로컬 분석 서버 오류 ({result.status_code})"
                post(f"/worker/fail/{job_id}", timeout=20, json={"detail": detail}).raise_for_status()
                print(f"job failed: {job_id} ({result.status_code})", flush=True)
        except KeyboardInterrupt:
            break
        except Exception as exc:
            print(f"worker error: {exc}", flush=True)
            if job_id:
                try:
                    post(f"/worker/fail/{job_id}", timeout=12, json={"detail": "분석 처리 중 오류가 발생했습니다."})
                except requests.RequestException:
                    pass
            time.sleep(2.0)


if __name__ == "__main__":
    main()
