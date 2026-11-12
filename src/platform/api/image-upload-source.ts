export interface ImageUploadSource {
  uri: string;
  name: string;
  mimeType: string;
  file: Blob | null;
}
