export const CHART_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const CHART_IMAGE_MAX_SOURCE_BYTES = 12 * 1024 * 1024;
export const CHART_IMAGE_MAX_DATA_URL_LENGTH = 4_000_000;

export type PreparedChartImage = {
  dataUrl: string;
  name: string;
  width: number;
  height: number;
  bytes: number;
};

export function validateChartImageMeta(type: string, size: number) {
  if (!CHART_IMAGE_TYPES.includes(type as (typeof CHART_IMAGE_TYPES)[number])) {
    throw new Error("รองรับเฉพาะ PNG, JPG และ WEBP");
  }
  if (size <= 0 || size > CHART_IMAGE_MAX_SOURCE_BYTES) {
    throw new Error("ไฟล์กราฟต้องมีขนาดไม่เกิน 12 MB");
  }
}

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("อ่านภาพไม่สำเร็จ"));
  reader.onerror = () => reject(new Error("อ่านภาพไม่สำเร็จ"));
  reader.readAsDataURL(blob);
});

export async function prepareChartImage(file: File): Promise<PreparedChartImage> {
  validateChartImageMeta(file.type, file.size);
  const bitmap = await createImageBitmap(file);
  const maxEdge = 1_600;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("เบราว์เซอร์ไม่รองรับการเตรียมภาพ");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (value) => value ? resolve(value) : reject(new Error("ย่อภาพไม่สำเร็จ")),
    "image/jpeg",
    0.86
  ));
  const dataUrl = await blobToDataUrl(blob);
  if (dataUrl.length > CHART_IMAGE_MAX_DATA_URL_LENGTH) {
    throw new Error("ภาพยังมีขนาดใหญ่เกินไป กรุณาครอปเฉพาะบริเวณกราฟ");
  }
  return { dataUrl, name: file.name, width, height, bytes: blob.size };
}
