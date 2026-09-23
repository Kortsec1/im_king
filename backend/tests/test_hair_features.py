import sys
from pathlib import Path
import unittest
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from hair_features import measure_mask,compare_hair,unknown,extract_hair,MODEL
import cv2

class HairTests(unittest.TestCase):
 @unittest.skipUnless(MODEL.exists(),'optional hair model not installed')
 def test_real_model_executes(self):
  path=Path(__file__).resolve().parents[2]/'frontend/dist/people/wikidata-Q22952.jpg'
  image=cv2.imdecode(np.frombuffer(path.read_bytes(),np.uint8),cv2.IMREAD_COLOR);self.assertIsNotNone(image)
  result=extract_hair(image,[150,80,410,420])
  self.assertIn(result['reason'],['visible_hair_geometry','hair_not_clear','cropped_or_occluded'])
  self.assertEqual(extract_hair(image,[150,80,410,420],single_face=False)['reason'],'multiple_faces')
 def test_short_and_long(self):
  mask=np.zeros((600,500),np.float32);mask[80:180,175:325]=.95
  short=measure_mask(mask,[175,180,325,380]);self.assertEqual(short['hair_length'],'short')
  mask[150:450,155:175]=.95;mask[150:450,325:345]=.95
  self.assertEqual(measure_mask(mask,[175,180,325,380])['hair_length'],'long')
 def test_unknown_and_crop(self):
  mask=np.zeros((600,500),np.float32)
  self.assertFalse(measure_mask(mask,[175,180,325,380])['usable'])
  mask[:180,175:325]=.95
  self.assertFalse(measure_mask(mask,[175,180,325,380])['usable'])
 def test_no_gender_inference_and_bounded_score(self):
  q={'usable':True,'hair_length':'long','bangs':'present'}
  self.assertEqual(compare_hair(q,q)['adjustment'],.015)
  self.assertEqual(compare_hair(q,{'usable':True,'hair_length':'short','bangs':'none'})['adjustment'],-.015)
  self.assertEqual(compare_hair(unknown('test'),q)['adjustment'],0)
  self.assertEqual(compare_hair(q,q,{'headwear':'present'})['adjustment'],0)
  self.assertEqual(compare_hair(q,{}, {'hair_length':'long'})['compared'],['hair_length'])
  self.assertNotIn('gender',q)
if __name__=='__main__':unittest.main()
