export const CHART_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const CHART_IMAGE_MAX_SOURCE_BYTES = 12 * 1024 * 1024;
export const CHART_IMAGE_MAX_DATA_URL_LENGTH = 2_000_000;

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
  let drawable: CanvasImageSource;
  let sourceWidth: number;
  let sourceHeight: number;
  let cleanup = () => {};

  let bitmap: ImageBitmap | null = null;
  if (typeof createImageBitmap === "function") {
    try { bitmap = await createImageBitmap(file); } catch { /* Fall back to an HTML image on mobile decoders. */ }
  }

  if (bitmap) {
    drawable = bitmap;
    sourceWidth = bitmap.width;
    sourceHeight = bitmap.height;
    cleanup = () => bitmap?.close();
  } else {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.decoding = "async";
    image.src = objectUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("เปิดภาพนี้ไม่สำเร็จ กรุณาบันทึกเป็น PNG หรือ JPG แล้วลองใหม่"));
    }).catch((error) => {
      URL.revokeObjectURL(objectUrl);
      throw error;
    });
    drawable = image;
    sourceWidth = image.naturalWidth;
    sourceHeight = image.naturalHeight;
    cleanup = () => URL.revokeObjectURL(objectUrl);
  }

  const maxEdge = 1_280;
  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    cleanup();
    throw new Error("เบราว์เซอร์ไม่รองรับการเตรียมภาพ");
  }
  try {
    context.fillStyle = "#101418";
    context.fillRect(0, 0, width, height);
    context.drawImage(drawable, 0, 0, width, height);
  } finally {
    cleanup();
  }
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (value) => value ? resolve(value) : reject(new Error("ย่อภาพไม่สำเร็จ")),
    "image/jpeg",
    0.8
  ));
  const dataUrl = await blobToDataUrl(blob);
  if (dataUrl.length > CHART_IMAGE_MAX_DATA_URL_LENGTH) {
    throw new Error("ภาพยังมีขนาดใหญ่เกินไป กรุณาครอปเฉพาะบริเวณกราฟ");
  }
  return { dataUrl, name: file.name, width, height, bytes: blob.size };
}
