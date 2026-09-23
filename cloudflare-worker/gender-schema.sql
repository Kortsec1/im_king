CREATE TABLE IF NOT EXISTS dataset_gender (
 item_id TEXT PRIMARY KEY, gender TEXT NOT NULL CHECK(gender IN ('male','female','unknown')),
 updated_at INTEGER NOT NULL, updated_by TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS audit_gender_insert AFTER INSERT ON dataset_gender BEGIN
 INSERT INTO activity_audit(created_at,actor_id,action,target_id,details,outcome) VALUES(NEW.updated_at,NEW.updated_by,'dataset.gender_updated',NEW.item_id,json_object('gender',NEW.gender),'success');
END;
CREATE TRIGGER IF NOT EXISTS audit_gender_update AFTER UPDATE ON dataset_gender BEGIN
 INSERT INTO activity_audit(created_at,actor_id,action,target_id,details,outcome) VALUES(NEW.updated_at,NEW.updated_by,'dataset.gender_updated',NEW.item_id,json_object('before',OLD.gender,'gender',NEW.gender),'success');
END;
