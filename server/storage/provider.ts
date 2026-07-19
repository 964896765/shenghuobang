export type PutObjectInput = { key: string; body: Buffer; contentType: string };
export interface StorageProvider {
  readonly name: "local" | "s3";
  put(input: PutObjectInput): Promise<void>;
  read(key: string): Promise<Buffer>;
  signedReadUrl(key: string, expiresSeconds: number): Promise<string>;
  exists(key: string): Promise<boolean>;
  checkReady(): Promise<boolean>;
}
