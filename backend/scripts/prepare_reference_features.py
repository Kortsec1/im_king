"""Precompute the same model measurements for every human reference photo."""
import json
import sys
from collections import Counter
from pathlib import Path
from urllib.request import Request, urlopen
import cv2
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'backend'))
from app_v2 import engine, DATA
from visual_similarity import face_traits
from hair_features import extract_hair

def main():
    entries={s['sample_id']:s for s in engine.samples}
    features={};failed=[]
    for i,(sid,s) in enumerate(entries.items()):
        try:
            path=s['path']
            if path.startswith('/people/'):
                raw=(ROOT/'frontend/dist'/path.lstrip('/')).read_bytes()
            elif path.startswith('https://im-king-analysis-queue.im-king-analysis-queue.workers.dev/dataset/image/'):
                with urlopen(Request(path,headers={'User-Agent':'LookalikeBackend/1.0'}),timeout=20) as response: raw=response.read()
            else: raise ValueError('Unsupported photo path')
            image=cv2.imdecode(np.frombuffer(raw,np.uint8),cv2.IMREAD_COLOR)
            faces=engine.analyzer.get(image)
            if not faces: raise ValueError('Face not found')
            face=max(faces,key=lambda f:float(np.prod(f.bbox[2:]-f.bbox[:2])))
            features[sid]={'traits':face_traits(face,image),'presentation':'male' if int(face.gender)==1 else 'female','age':int(face.age),'detection_score':float(face.det_score),'item_id':engine.people[s['person_index']]['id']}
            features[sid]['hair_features']=extract_hair(image,face.bbox,single_face=len(faces)==1)
        except Exception as error: failed.append({'sample_id':sid,'error':type(error).__name__})
        if (i+1)%25==0: print(f'Analyzed {i+1}/{len(entries)} photos',flush=True)
    people={}
    for person in engine.people:
        gender={'Q6581097':'male','Q6581072':'female'}.get(person.get('gender'),'unknown')
        votes=Counter(x['presentation'] for x in features.values() if x['item_id']==person['id'])
        source='metadata' if gender!='unknown' else 'unknown'
        if gender=='unknown' and votes:
            top,count=votes.most_common(1)[0]
            if count/sum(votes.values())>=.75: gender=top;source='model_estimate'
        people[person['id']]={'gender':gender,'gender_source':source,'name':person['name'],'photos':sum(votes.values())}
    if any(x['hair_features'].get('reason')=='model_unavailable' for x in features.values()):
        raise RuntimeError('Hair model unavailable; existing cache was preserved')
    result={'version':2,'photos':features,'people':people,'failures':failed}
    temp=DATA/'reference_features.tmp.json'
    temp.write_text(json.dumps(result,ensure_ascii=False,allow_nan=False),encoding='utf-8')
    temp.replace(DATA/'reference_features.json')
    (ROOT/'frontend/dist/dataset-genders.json').write_text(json.dumps({'items':people},ensure_ascii=False),encoding='utf-8')
    print(json.dumps({'photos':len(features),'failed':failed,'gender_counts':dict(Counter(x['gender'] for x in people.values())),'source_counts':dict(Counter(x['gender_source'] for x in people.values()))},ensure_ascii=False),flush=True)
if __name__=='__main__':main()
