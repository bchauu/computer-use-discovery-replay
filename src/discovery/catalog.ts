import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Connection } from 'mongoose';
import { capabilityArtifactSchema } from '../contracts/capability.ts';
import type { CapabilityArtifact } from '../contracts/capability.ts';

export class CapabilityCatalog {
  private readonly database: Connection;
  private readonly directory: string;
  private readonly memory = new Map<string, CapabilityArtifact[]>();

  constructor(database: Connection, directory = path.resolve('.local', 'capabilities')) {
    this.database = database;
    this.directory = directory;
  }

  async register(artifact: CapabilityArtifact) {
    const parsed = capabilityArtifactSchema.parse(artifact);
    const versions = this.memory.get(parsed.artifactId) ?? [];
    const retained = versions.filter(item => !(item.artifactVersion === parsed.artifactVersion && item.source.runId === parsed.source.runId));
    retained.push(parsed);
    this.memory.set(parsed.artifactId, retained);
    const preferred = this.preferred(retained)!;
    await mkdir(this.directory, { recursive: true });
    await writeFile(path.join(this.directory, `${parsed.artifactId}.json`), `${JSON.stringify(preferred, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  }

  async resolve(artifactId: CapabilityArtifact['artifactId']) {
    const memory = this.preferred(this.memory.get(artifactId) ?? []);
    if (memory) return memory;
    if (this.database.readyState === 1) {
      const documents = await this.database.collection('capabilityArtifacts')
        .find({ artifactId, status: { $in: ['validated', 'draft'] } })
        .sort({ status: -1, artifactVersion: -1 })
        .limit(10).toArray();
      const parsed = documents.flatMap(document => {
        const { _id: _ignored, ...candidate } = document;
        const result = capabilityArtifactSchema.safeParse(candidate);
        return result.success ? [result.data] : [];
      });
      const preferred = this.preferred(parsed);
      if (preferred) { await this.register(preferred); return preferred; }
    }
    try {
      const raw = await readFile(path.join(this.directory, `${artifactId}.json`), 'utf8');
      const parsed = capabilityArtifactSchema.parse(JSON.parse(raw));
      await this.register(parsed);
      return parsed;
    } catch { return null; }
  }

  async promote(artifact: CapabilityArtifact) {
    const validated = capabilityArtifactSchema.parse({ ...artifact, status: 'validated' });
    await this.register(validated);
    if (this.database.readyState === 1) {
      await this.database.collection('capabilityArtifacts').updateOne(
        { artifactId: validated.artifactId, artifactVersion: validated.artifactVersion, 'source.runId': validated.source.runId },
        { $set: validated },
        { upsert: true },
      );
    }
    return validated;
  }

  private preferred(artifacts: CapabilityArtifact[]) {
    return [...artifacts].sort((left, right) => {
      const status = (right.status === 'validated' ? 2 : 1) - (left.status === 'validated' ? 2 : 1);
      return status || right.artifactVersion - left.artifactVersion;
    })[0] ?? null;
  }
}
