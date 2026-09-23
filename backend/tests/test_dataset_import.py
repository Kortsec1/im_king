import copy
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np
from PIL import Image
from fastapi import HTTPException

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import dataset_import as ingest
from app_v2 import engine

class ImportTests(unittest.TestCase):
 def test_private_urls_blocked(self):
  for url in ['http://example.com/x.jpg','https://127.0.0.1/x','https://[::1]/x','https://user:pass@example.com/x','https://example.com:8443/x']:
   with self.assertRaises(HTTPException):ingest.download_image(url)
 def test_image_validation(self):
  with self.assertRaises(HTTPException):ingest.normalize_image(b'<html>no image</html>')
  output=io.BytesIO();Image.new('RGB',(20,20)).save(output,'PNG')
  with self.assertRaises(HTTPException):ingest.normalize_image(output.getvalue())
 def test_worker_auth(self):
  with self.assertRaises(HTTPException):ingest.require_worker('Bearer incorrect')
 def test_gender_filter_and_admin_override(self):
  person=engine.people[0]
  raw=(Path(__file__).resolve().parents[2]/'frontend/dist/people'/f"{person['id']}.jpg").read_bytes()
  overrides=[]
  def response(url,**kwargs):
   address=url if isinstance(url,str) else url.full_url
   return io.BytesIO(json.dumps({'removed':[], 'genders':overrides} if 'photo-state' in address else []).encode())
  with patch('app_v2.urlopen',side_effect=response):
   result=engine.match(raw)
   self.assertIn('hair_features',result['profile_estimates'])
   self.assertTrue(all(abs(m['hair_comparison']['adjustment'])<=.015 for m in result['matches']))
   expected='male' if result['profile_estimates']['presentation']=='남성형' else 'female'
   self.assertEqual(len(result['matches']),3)
   for item in result['matches']:
    self.assertEqual(item['dataset_gender'],expected)
    self.assertEqual(engine.reference_features['people'][item['id']]['gender'],expected)
   for chosen in ['male','female']:
    selected=engine.match(raw,chosen)
    self.assertEqual(selected['match_preferences'],{'gender':chosen,'source':'user'})
    self.assertEqual(len(selected['matches']),3)
    self.assertTrue(all(m['dataset_gender']==chosen for m in selected['matches']))
   with self.assertRaises(HTTPException):engine.match(raw,'invalid')
   overrides.extend({'item_id':p['id'],'gender':'unknown'} for p in engine.people)
   self.assertEqual(engine.match(raw)['matches'],[])
   overrides[0]['gender']=expected
   self.assertEqual([m['id'] for m in engine.match(raw)['matches']],[person['id']])
 def test_deleted_photo_excluded_from_matching(self):
  person=engine.people[0]
  raw=(Path(__file__).resolve().parents[2]/'frontend/dist/people'/f"{person['id']}.jpg").read_bytes()
  own=[s for s in engine.samples if s['person_index']==0]
  self.assertGreater(len(own),1)
  removed={own[0]['sample_id']}
  def response(url,**kwargs):
   address=url if isinstance(url,str) else url.full_url
   return io.BytesIO(json.dumps({'removed':[{'sample_id':s} for s in removed], 'metadata':[{'item_id':person['id'],'name':'수정 이름','group':'수정 분류','description':'수정 설명'}]} if 'photo-state' in address else []).encode())
  with patch('app_v2.urlopen',side_effect=response):
   result=engine.match(raw)
   match=next(x for x in result['matches'] if x['id']==person['id'])
   self.assertEqual(match['image_url'],own[1]['path'])
   self.assertEqual(match['name'],'수정 이름')
   self.assertEqual(match['category'],'수정 분류')
   removed.update(s['sample_id'] for s in own)
   result=engine.match(raw)
   self.assertNotIn(person['id'],[x['id'] for x in result['matches']])
 def test_real_models_and_persistence(self):
  data=json.loads((Path(__file__).resolve().parents[2]/'frontend/dist/dataset-v2.json').read_text(encoding='utf-8'))
  human=next(x for x in data['items'] if x['type']=='human')
  samples=[human,next(x for x in data['items'] if x['type']=='character'),next(x for x in data['items'] if x['type']=='animal')]
  clone=copy.copy(engine)
  clone.people=copy.deepcopy(engine.people);clone.samples=copy.deepcopy(engine.samples);clone.face_traits=copy.deepcopy(engine.face_traits)
  clone.gallery=engine.gallery.copy();clone.visual_items=copy.deepcopy(engine.visual_items);clone.visual_vectors=engine.visual_vectors.copy();clone.custom_samples=set()
  with tempfile.TemporaryDirectory() as tmp:
   for item in samples:
    raw=ingest.download_image('https://im-king-lookalike.vercel.app'+item['image'])
    with patch.object(ingest,'download_image',return_value=raw):
     payload=ingest.prepare_record(clone,{'name':'test '+item['name'],'category':item['type'],'image_url':'https://example.com/image.jpg'})
    record=payload['record']
    self.assertTrue(record['vectors']);self.assertLess(len(payload['image']),700000)
    if item['type']=='human':
     self.assertEqual(len(record['detail']['landmarks']),106)
     self.assertEqual(len(record['vectors'][0]),512)
    ingest.merge_records(clone,[record]);size=len(clone.custom_samples)
    ingest.merge_records(clone,[record]);self.assertEqual(len(clone.custom_samples),size)
    self.assertTrue(ingest.save_record(Path(tmp),record));self.assertFalse(ingest.save_record(Path(tmp),record))
    if item['type']=='human':
     result=clone.match(raw)
     self.assertIn(record['item']['id'],[x['id'] for x in result['matches']])
    else:
     import cv2
     image=cv2.imdecode(np.frombuffer(ingest.normalize_image(raw),np.uint8),cv2.IMREAD_COLOR)
     result=clone.visual_matches(image,item['type'])
     self.assertIn(record['item']['id'],[x['id'] for x in result])
   self.assertEqual(len(ingest.load_records(Path(tmp))),3)
   print('Real URL downloads, human 106 landmarks + 512D, character/animal matching, dedupe and restart persistence: PASS')

if __name__=='__main__':unittest.main()
