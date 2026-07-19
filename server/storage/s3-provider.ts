import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageProvider, PutObjectInput } from "./provider";
import { ENV } from "../_core/env";

export class S3CompatibleStorageProvider implements StorageProvider {
  readonly name = "s3" as const;
  private client = new S3Client({
    region: ENV.s3Region,
    endpoint: ENV.s3Endpoint || undefined,
    forcePathStyle: ENV.s3ForcePathStyle,
    credentials: ENV.s3AccessKeyId && ENV.s3SecretAccessKey ? { accessKeyId: ENV.s3AccessKeyId, secretAccessKey: ENV.s3SecretAccessKey } : undefined,
  });
  async put(input: PutObjectInput) { await this.client.send(new PutObjectCommand({ Bucket: ENV.s3Bucket, Key: input.key, Body: input.body, ContentType: input.contentType })); }
  async read(key: string) { const out=await this.client.send(new GetObjectCommand({ Bucket: ENV.s3Bucket, Key:key })); return Buffer.from(await out.Body!.transformToByteArray()); }
  async signedReadUrl(key: string, expiresSeconds: number) { return getSignedUrl(this.client, new GetObjectCommand({ Bucket: ENV.s3Bucket, Key:key }), { expiresIn: expiresSeconds }); }
  async exists(key: string) { try { await this.client.send(new HeadObjectCommand({ Bucket: ENV.s3Bucket, Key:key })); return true; } catch { return false; } }
  async checkReady() { try { await this.client.send(new HeadObjectCommand({ Bucket: ENV.s3Bucket, Key:".shenghuobang-readiness" })); return true; } catch (error) { const status=(error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode; return status === 404; } }
}
