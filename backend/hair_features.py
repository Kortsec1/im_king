"""Visible hair geometry, not gender classification. Unknown contributes zero."""
from pathlib import Path
import logging
import threading
import cv2
import numpy as np

MODEL=Path(__file__).parent/'models'/'hair_segmenter-v1.tflite'
VERSION='hair-segmentation-v1'
_lock=threading.Lock()
_segmenter=None
_failed=False

def unknown(reason):
    return {'version':VERSION,'hair_length':'unknown','bangs':'unknown','usable':False,'reason':reason}

def measure_mask(probability,bbox):
    p=np.asarray(probability,dtype=np.float32)
    x1,y1,x2,y2=map(float,bbox);fw,fh=x2-x1,y2-y1
    if p.ndim!=2 or fw<48 or fh<48 or not np.isfinite(p).all():return unknown('small_or_invalid')
    h,w=p.shape;hair=p>=.8;region=np.zeros_like(hair)
    left,right=max(0,int(x1-.7*fw)),min(w,int(x2+.7*fw))
    top,bottom=max(0,int(y1-.8*fh)),min(h,int(y2+fh))
    region[top:bottom,left:right]=True;hair &= region
    ys,xs=np.where(hair)
    if len(ys)<max(50,.025*fw*fh):return unknown('hair_not_clear')
    if np.any(xs<=left+1) or np.any(xs>=right-2) or np.any(ys<=top+1) or np.any(ys>=bottom-2):return unknown('cropped_or_occluded')
    lower=float((np.quantile(ys,.97)-y1)/fh)
    length='long' if lower>1.12 else ('medium' if lower>.72 else 'short')
    forehead=p[max(0,int(y1+.02*fh)):min(h,int(y1+.28*fh)),max(0,int(x1+.22*fw)):min(w,int(x2-.22*fw))]
    coverage=float((forehead>=.8).mean()) if forehead.size else .15
    bangs='present' if coverage>=.30 else ('none' if coverage<=.08 else 'unknown')
    return {'version':VERSION,'hair_length':length,'bangs':bangs,'usable':True,'reason':'visible_hair_geometry','lower_extent':round(lower,4),'forehead_coverage':round(coverage,4)}

def extract_hair(image,bbox,single_face=True):
    global _segmenter,_failed
    if not single_face:return unknown('multiple_faces')
    if not MODEL.exists() or _failed:return unknown('model_unavailable')
    try:
        import mediapipe as mp
        with _lock:
            if _segmenter is None:
                opts=mp.tasks.vision.ImageSegmenterOptions(base_options=mp.tasks.BaseOptions(model_asset_buffer=MODEL.read_bytes()),output_category_mask=False,output_confidence_masks=True)
                _segmenter=mp.tasks.vision.ImageSegmenter.create_from_options(opts)
            scale=min(1.,768/max(image.shape[:2]))
            resized=cv2.resize(image,None,fx=scale,fy=scale) if scale<1 else image
            result=_segmenter.segment(mp.Image(image_format=mp.ImageFormat.SRGB,data=cv2.cvtColor(resized,cv2.COLOR_BGR2RGB)))
            mask=result.confidence_masks[1].numpy_view().copy().squeeze()
        return measure_mask(mask,np.asarray(bbox)*scale)
    except Exception:
        if not _failed:logging.exception('Hair model unavailable; continuing face-only comparison')
        _failed=True
        return unknown('model_unavailable')

def compare_hair(query,reference,admin=None):
    admin=admin or {}
    if not query.get('usable') or admin.get('headwear')=='present':return {'adjustment':0.,'compared':[]}
    values=[];compared=[]
    for key,weight in [('hair_length',.010),('bangs',.005)]:
        q=query.get(key,'unknown');r=admin.get(key,'unknown')
        if r=='unknown':r=reference.get(key,'unknown') if reference.get('usable') else 'unknown'
        if q=='unknown' or r=='unknown':continue
        if key=='hair_length' and q in ['short','medium','long'] and r in ['short','medium','long']:
            value=1-abs(['short','medium','long'].index(q)-['short','medium','long'].index(r))
        else:value=1 if q==r else -1
        values.append(weight*value);compared.append(key)
    return {'adjustment':round(sum(values),5),'compared':compared}

def hair_description(features):
    if not features.get('usable'):return '머리 전체가 보이지 않거나 불명확함 · 헤어 비교 제외'
    length={'short':'짧게 보이는 머리','medium':'중간 길이로 보이는 머리','long':'길게 보이는 머리'}[features['hair_length']]
    fringe={'present':'이마를 덮는 앞머리','none':'이마가 드러남','unknown':'앞머리 확인 어려움'}[features['bangs']]
    return length+' · '+fringe+' (사진상 추정)'
