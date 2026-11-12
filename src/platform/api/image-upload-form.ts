import type { ImageUploadSource } from "./image-upload-source";

export function createImageUploadForm(image: ImageUploadSource): FormData {
  if (!image.file) throw new Error("所选图片文件不可用，请重新选择。");
  const form = new FormData();
  form.append("file", image.file, image.name);
  return form;
}
