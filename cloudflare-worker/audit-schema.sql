CREATE TABLE IF NOT EXISTS activity_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT, created_at INTEGER NOT NULL, actor_id TEXT,
 action TEXT NOT NULL, target_id TEXT NOT NULL, details TEXT NOT NULL DEFAULT '{}', outcome TEXT NOT NULL DEFAULT 'success'
);
CREATE INDEX IF NOT EXISTS activity_action_id ON activity_audit(action,id DESC);
CREATE TRIGGER IF NOT EXISTS audit_job_created AFTER INSERT ON jobs BEGIN
 INSERT INTO activity_audit(created_at,actor_id,action,target_id,outcome)
 VALUES(NEW.created_at,CASE WHEN NEW.client_hash LIKE 'admin:%' THEN substr(NEW.client_hash,7) ELSE NULL END,
 CASE WHEN NEW.content_type='application/vnd.lookalike.dataset+json' THEN 'import.requested' ELSE 'analysis.requested' END,NEW.id,'accepted');
END;
CREATE TRIGGER IF NOT EXISTS audit_job_finished AFTER UPDATE OF status ON jobs
 WHEN NEW.status IN ('complete','failed','expired') AND OLD.status NOT IN ('complete','failed','expired') BEGIN
 INSERT INTO activity_audit(created_at,actor_id,action,target_id,outcome)
 VALUES(NEW.updated_at,CASE WHEN NEW.client_hash LIKE 'admin:%' THEN substr(NEW.client_hash,7) ELSE NULL END,
 (CASE WHEN NEW.content_type='application/vnd.lookalike.dataset+json' THEN 'import.' ELSE 'analysis.' END)||NEW.status,NEW.id,
 CASE WHEN NEW.status='complete' THEN 'success' ELSE 'failed' END);
END;
CREATE TRIGGER IF NOT EXISTS audit_photo_deleted AFTER INSERT ON dataset_photo_exclusions BEGIN
 INSERT INTO activity_audit(created_at,actor_id,action,target_id,details) VALUES(NEW.removed_at,NEW.removed_by,'photo.deleted',NEW.sample_id,json_object('item_id',NEW.item_id));
END;
CREATE TRIGGER IF NOT EXISTS audit_metadata_created AFTER INSERT ON dataset_metadata BEGIN
 INSERT INTO activity_audit(created_at,actor_id,action,target_id,details) VALUES(NEW.updated_at,NEW.updated_by,'dataset.updated',NEW.item_id,json_object('name',NEW.name,'group',NEW.group_name,'description_changed',1));
END;
CREATE TRIGGER IF NOT EXISTS audit_metadata_updated AFTER UPDATE ON dataset_metadata BEGIN
 INSERT INTO activity_audit(created_at,actor_id,action,target_id,details) VALUES(NEW.updated_at,NEW.updated_by,'dataset.updated',NEW.item_id,json_object('before_name',OLD.name,'name',NEW.name,'before_group',OLD.group_name,'group',NEW.group_name,'description_changed',OLD.description<>NEW.description));
END;
CREATE TRIGGER IF NOT EXISTS audit_sample_created AFTER INSERT ON dataset_samples BEGIN
 INSERT INTO activity_audit(created_at,actor_id,action,target_id,details) VALUES(NEW.created_at,NULL,'photo.registered',NEW.sample_id,json_object('item_id',NEW.item_id));
END;
