import { File } from "expo-file-system";
import type { ImageUploadSource } from "./image-upload-source";

export function createImageUploadForm(image: ImageUploadSource): FormData {
  const form = new FormData();
  // SDK 58 expo/fetch needs a Blob-compatible file, not the legacy RN URI object.
  form.append("file", image.file ?? new File(image.uri), image.name);
  return form;
}
