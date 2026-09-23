CREATE TABLE IF NOT EXISTS dataset_photo_attributes (
 sample_id TEXT PRIMARY KEY,
 item_id TEXT NOT NULL,
 attributes TEXT NOT NULL CHECK(json_valid(attributes)),
 updated_at INTEGER NOT NULL,
 updated_by TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS audit_photo_attributes_insert AFTER INSERT ON dataset_photo_attributes BEGIN
 INSERT INTO activity_audit(created_at,actor_id,action,target_id,details,outcome)
 VALUES(NEW.updated_at,NEW.updated_by,'photo.attributes_updated',NEW.sample_id,json_object('item_id',NEW.item_id,'glasses',json_extract(NEW.attributes,'$.glasses'),'beard',json_extract(NEW.attributes,'$.beard'),'hair_length',json_extract(NEW.attributes,'$.hair_length'),'bangs',json_extract(NEW.attributes,'$.bangs'),'headwear',json_extract(NEW.attributes,'$.headwear')),'success');
END;
CREATE TRIGGER IF NOT EXISTS audit_photo_attributes_update AFTER UPDATE ON dataset_photo_attributes BEGIN
 INSERT INTO activity_audit(created_at,actor_id,action,target_id,details,outcome)
 VALUES(NEW.updated_at,NEW.updated_by,'photo.attributes_updated',NEW.sample_id,json_object('item_id',NEW.item_id,'glasses',json_extract(NEW.attributes,'$.glasses'),'beard',json_extract(NEW.attributes,'$.beard'),'hair_length',json_extract(NEW.attributes,'$.hair_length'),'bangs',json_extract(NEW.attributes,'$.bangs'),'headwear',json_extract(NEW.attributes,'$.headwear')),'success');
END;
