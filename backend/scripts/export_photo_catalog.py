"""Export every retained reference and its own geometry; no embeddings are public."""
import json
import re
import sys
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageOps
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'backend'))
from insightface.app import FaceAnalysis
from visual_similarity import face_traits
DIST=ROOT/'frontend/dist'; DATA=ROOT/'backend/data/gallery_v2'; PUBLIC=ROOT/'backend/data/public'

def main():
 dataset=json.loads((DIST/'dataset-v2.json').read_text(encoding='utf-8'))
 analyzer=FaceAnalysis(name='buffalo_l',allowed_modules=['detection','landmark_2d_106'],providers=['CPUExecutionProvider'])
 analyzer.prepare(ctx_id=-1,det_size=(512,512))
 catalog={};geometry={};registry=[];missing=[]
 (DIST/'photo-details').mkdir(exist_ok=True)
 for i,item in enumerate(dataset['items']):
  folder='people' if item['type']=='human' else 'nonhuman';item_id=item['id']
  files={p.name:p for p in (PUBLIC/folder).glob(item_id+'*.jpg') if re.fullmatch(re.escape(item_id)+r'(?:-ref\d+)?\.jpg',p.name)}
  files.update({p.name:p for p in (DIST/folder).glob(item_id+'*.jpg') if re.fullmatch(re.escape(item_id)+r'(?:-ref\d+)?\.jpg',p.name)})
  photos=[];details={}
  for filename,path in sorted(files.items(),key=lambda kv:int(re.search(r'-ref(\d+)\.jpg$',kv[0])[1]) if '-ref' in kv[0] else 1):
   number=int(re.search(r'-ref(\d+)\.jpg$',filename)[1]) if '-ref' in filename else 1
   target=DIST/folder/filename
   if not target.exists():
    with Image.open(path) as original:
     normalized=ImageOps.exif_transpose(original).convert('RGB');normalized.thumbnail((900,900));normalized.save(target,'JPEG',quality=85,optimize=True)
   frame=cv2.imdecode(np.fromfile(target,np.uint8),cv2.IMREAD_COLOR)
   if frame is None:raise RuntimeError(f'Invalid retained reference: {filename}')
   h,w=frame.shape[:2];detail={'width':w,'height':h,'landmarks':[],'keypoints':[],'bbox':None,'traits':{}}
   if item['type']=='human':
    faces=analyzer.get(frame)
    if faces:
     face=max(faces,key=lambda f:float((f.bbox[2]-f.bbox[0])*(f.bbox[3]-f.bbox[1])))
     detail.update(landmarks=(np.asarray(face.landmark_2d_106)/[w,h]).round(6).tolist(),keypoints=(np.asarray(face.kps)/[w,h]).round(6).tolist(),bbox=(np.asarray(face.bbox)/[w,h,w,h]).round(6).tolist(),traits=face_traits(face,frame))
    else:missing.append(filename)
   sample_id=f'base-{item_id}-{number}'
   photo={'sample_id':sample_id,'item_id':item_id,'image':f'/{folder}/{filename}','created_at':None}
   photos.append(photo);registry.append(photo);details[sample_id]=detail;geometry[sample_id]=detail
  catalog[item_id]=photos
  (DIST/'photo-details'/f'{item_id}.json').write_text(json.dumps(details,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
  if (i+1)%50==0:print(f'photo catalog {i+1}/{len(dataset["items"])}',flush=True)
 (DIST/'dataset-photo-index.json').write_text(json.dumps({'items':catalog},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
 (DATA/'photo_geometry.json').write_text(json.dumps(geometry,separators=(',',':')),encoding='utf-8')
 (ROOT/'cloudflare-worker/src/base-photos.json').write_text(json.dumps(registry,separators=(',',':')),encoding='utf-8')
 print(f'Exported {len(registry)} photos for {len(catalog)} targets; human detection missing: {missing}')

if __name__=='__main__':main()
