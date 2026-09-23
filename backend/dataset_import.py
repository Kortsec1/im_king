"""Admin-only URL ingestion. Cloudflare is canonical; local records are a cache."""
from __future__ import annotations
import base64
import hashlib
import hmac
import http.client
import io
import ipaddress
import json
import os
import socket
import ssl
import threading
import warnings
from pathlib import Path
from urllib.parse import urlsplit, urljoin

import cv2
import numpy as np
from PIL import Image, ImageOps
from fastapi import HTTPException
from visual_similarity import visual_embedding

QUEUE_URL = 'https://im-king-analysis-queue.im-king-analysis-queue.workers.dev'
LOCK = threading.RLock()

def require_worker(authorization):
    secret = os.environ.get('IM_KING_WORKER_SECRET', '')
    if not secret or not hmac.compare_digest(authorization or '', 'Bearer '+secret):
        raise HTTPException(403, '관리자 등록 작업만 사용할 수 있습니다.')

class PublicHTTPS(http.client.HTTPSConnection):
    def __init__(self, host, address):
        super().__init__(host, timeout=12, context=ssl.create_default_context())
        self.address = address

    def connect(self):
        # Pin the already-validated IP; TLS still verifies the original hostname.
        sock = socket.create_connection((self.address, 443), self.timeout)
        try:
            self.sock = self._context.wrap_socket(sock, server_hostname=self.host)
        except Exception:
            sock.close()
            raise

def download_image(url):
    for _ in range(4):
        parsed = urlsplit(url)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.port not in (None,443):
            raise HTTPException(400, '공개 HTTPS 이미지 주소만 사용할 수 있습니다.')
        try:
            addresses = {answer[4][0] for answer in socket.getaddrinfo(parsed.hostname,443,type=socket.SOCK_STREAM)}
        except OSError:
            raise HTTPException(400, '이미지 주소에 연결할 수 없습니다.')
        if not addresses or any(not ipaddress.ip_address(addr).is_global for addr in addresses):
            raise HTTPException(400, '내부 네트워크 주소는 사용할 수 없습니다.')
        conn = PublicHTTPS(parsed.hostname, sorted(addresses)[0])
        try:
            path=parsed.path or '/'
            if parsed.query: path+='?'+parsed.query
            conn.request('GET',path,headers={'User-Agent':'LookalikeLab/1.0 dataset-import','Accept':'image/jpeg,image/png,image/webp','Accept-Encoding':'identity'})
            response=conn.getresponse()
            if response.status in (301,302,303,307,308):
                location=response.getheader('Location')
                if not location: raise HTTPException(400,'이미지 리디렉션 주소가 없습니다.')
                url=urljoin(url,location)
                continue
            if response.status!=200: raise HTTPException(400,f'이미지 서버가 다운로드를 허용하지 않습니다. (HTTP {response.status})')
            if response.getheader('Content-Type','').split(';')[0].lower() not in ('image/jpeg','image/png','image/webp'):
                raise HTTPException(415,'웹페이지가 아닌 JPG·PNG·WebP 이미지 파일 링크를 넣어 주세요.')
            raw=response.read(8*1024*1024+1)
            if len(raw)>8*1024*1024: raise HTTPException(413,'이미지는 8MB 이하로 넣어 주세요.')
            return raw
        except (OSError,http.client.HTTPException,ValueError):
            raise HTTPException(400,'이미지 다운로드에 실패했습니다. 공개 이미지 링크인지 확인해 주세요.')
        finally:
            conn.close()
    raise HTTPException(400,'이미지 주소의 리디렉션이 너무 많습니다.')

def normalize_image(raw):
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error',Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as source:
                if source.format not in ('JPEG','PNG','WEBP') or source.width*source.height>16000000:
                    raise ValueError('size')
                if min(source.size)<96: raise ValueError('small')
                image=ImageOps.exif_transpose(source).convert('RGB')
                image.thumbnail((1200,1200))
                for quality in (90,82,72,60):
                    out=io.BytesIO();image.save(out,'JPEG',quality=quality,optimize=True)
                    if out.tell()<=480000: return out.getvalue()
                raise ValueError('size')
    except Exception:
        raise HTTPException(400,'96px 이상, 1,600만 화소 이하의 JPG·PNG·WebP 사진을 사용해 주세요.')

def prepare_record(engine, data):
    name=str(data.get('name','')).strip()
    kind=data.get('category')
    if not name or len(name)>80 or kind not in ('human','character','animal'):
        raise HTTPException(400,'이름과 카테고리를 확인해 주세요.')
    raw=normalize_image(download_image(str(data.get('image_url',''))))
    digest=hashlib.sha256(raw).hexdigest()
    existing_id=str(data.get('existing_id',''))
    if existing_id:
        candidates=engine.people if kind=='human' else [i for i in engine.visual_items if i['type']==kind]
        existing=next((i for i in candidates if i['id']==existing_id),None)
        if not existing: raise HTTPException(404,'기존 대상을 찾지 못했습니다. 카테고리와 목록을 새로 확인해 주세요.')
        name=existing['name']
    item_id=existing_id or 'custom-'+hashlib.sha256((kind+name.casefold()).encode()).hexdigest()[:24]
    sample_id='sample-'+hashlib.sha256((item_id+digest).encode()).hexdigest()[:32]
    labels={'human':'인물','character':'애니 캐릭터','animal':'동물'}
    group=str(data.get('group','')).strip()[:80] or labels[kind]
    item={'id':item_id,'type':kind,'name':name,'group':group,'image':QUEUE_URL+'/dataset/image/'+sample_id,
          'description':str(data.get('description','')).strip()[:500] or f'{name}의 공개 기준 사진. '+('얼굴의 구조와 임베딩을 함께 비교합니다.' if kind=='human' else '대상의 윤곽·색·질감 특징을 전용 모델로 비교합니다.'),
          'source':str(data['image_url']),'sample_count':1,'custom':True}
    image=cv2.imdecode(np.frombuffer(raw,np.uint8),cv2.IMREAD_COLOR)
    if kind=='human':
        faces=engine.analyzer.get(image)
        if len(faces)!=1: raise HTTPException(422,'한 사람의 얼굴이 선명하게 나온 사진을 사용해 주세요. '+('얼굴을 찾지 못했습니다.' if not faces else '여러 얼굴이 검출되었습니다.'))
        if min(faces[0].bbox[2:]-faces[0].bbox[:2])<64 or float(faces[0].det_score)<.65:
            raise HTTPException(422,'얼굴이 너무 작거나 불명확합니다. 얼굴이 더 크게 나온 사진을 사용해 주세요.')
        queries,_,traits,_,face=engine.extract(raw)
        vectors=queries.tolist()
        detail={**face['analysis_geometry'],'traits':traits,'presentation':'male' if int(face.gender)==1 else 'female','age':int(face.age),'hair_features':face.get('hair_features') or {}}
        item['gender']=detail['presentation'];item['gender_source']='model_estimate'
    else:
        vectors=[visual_embedding(image,kind).tolist()]
        detail={'width':image.shape[1],'height':image.shape[0],'landmarks':[], 'traits':{}, 'model':kind+'_visual_ensemble_v1'}
    return {'record':{'sample_id':sample_id,'item':item,'vectors':vectors,'detail':detail},'image':base64.b64encode(raw).decode()}

def load_records(directory):
    return [json.loads(path.read_text(encoding='utf-8')) for path in sorted(directory.glob('sample-*.json'))]

def save_record(directory,record):
    if not __import__('re').fullmatch(r'sample-[a-f0-9]{32}',record.get('sample_id','')):
        raise HTTPException(400,'등록 데이터 ID가 올바르지 않습니다.')
    directory.mkdir(parents=True,exist_ok=True)
    dest=directory/(record['sample_id']+'.json')
    if dest.exists(): return False
    temp=dest.with_suffix('.tmp')
    with temp.open('w',encoding='utf-8') as output:
        json.dump(record,output,ensure_ascii=False,allow_nan=False)
        output.flush();os.fsync(output.fileno())
    os.replace(temp,dest)
    return True

def merge_records(engine, records):
    # Called only under LOCK, with inference serialized against this mutation.
    for record in records:
        if record['sample_id'] in engine.custom_samples: continue
        item=record['item'];vectors=np.asarray(record['vectors'],dtype=np.float32)
        kind=item['type']
        expected=engine.gallery.shape[1] if kind=='human' else engine.visual_vectors.shape[1]
        if vectors.ndim!=2 or vectors.shape[1]!=expected or not np.isfinite(vectors).all():
            raise HTTPException(400,'비교 벡터가 올바르지 않습니다.')
        vectors=vectors/np.maximum(np.linalg.norm(vectors,axis=1,keepdims=True),1e-12)
        if kind=='human':
            index=next((i for i,p in enumerate(engine.people) if p['id']==item['id']),None)
            if index is None:
                index=len(engine.people)
                engine.people.append({'id':item['id'],'name':item['name'],'occupations':[item['group']],'image_url':item['image'],'gender':{'male':'Q6581097','female':'Q6581072'}.get(item.get('gender'))})
                engine.face_traits[item['id']]=record['detail']['traits']
            engine.gallery=np.vstack([engine.gallery,vectors])
            engine.samples.extend({'person_index':index,'path':item['image'],'sample_id':record['sample_id'],'traits':record['detail'].get('traits',{}),'hair_features':record['detail'].get('hair_features',{})} for _ in vectors)
        else:
            engine.visual_items.extend({**item,'sample_id':record['sample_id']} for _ in vectors)
            engine.visual_vectors=np.vstack([engine.visual_vectors,vectors])
        engine.custom_samples.add(record['sample_id'])
    engine.sample_columns=[np.asarray([i for i,s in enumerate(engine.samples) if s['person_index']==p],dtype=np.int32) for p in range(len(engine.people))]
