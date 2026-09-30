import type { Connection } from 'mongoose';

export async function ensureAutomationIndexes(database: Connection) {
  if (database.readyState !== 1) throw new Error('DATABASE_NOT_CONNECTED');
  await Promise.all([
    database.collection('discoveryRuns').createIndex(
      { runId: 1 },
      { unique: true, name: 'discovery_run_id_unique' },
    ),
    database.collection('discoveryRuns').createIndex(
      { updatedAt: -1 },
      { name: 'discovery_run_updated_at' },
    ),
    database.collection('capabilityArtifacts').createIndex(
      { artifactId: 1, artifactVersion: 1, 'source.runId': 1 },
      { unique: true, name: 'capability_source_unique' },
    ),
    database.collection('capabilityArtifacts').createIndex(
      { artifactId: 1, status: 1, artifactVersion: -1 },
      { name: 'capability_catalog_lookup' },
    ),
  ]);
}
