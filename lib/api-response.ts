export async function readApiPayload<T>(response: Response): Promise<T & { error?: string }> {
  const raw = await response.text();
  if (!raw) {
    throw new Error(response.status === 413
      ? "ภาพมีขนาดใหญ่เกินกว่าที่เซิร์ฟเวอร์รับได้ กรุณาครอปภาพแล้วลองใหม่"
      : `เซิร์ฟเวอร์ไม่ส่งผลลัพธ์กลับมา (${response.status})`);
  }

  try {
    return JSON.parse(raw) as T & { error?: string };
  } catch {
    throw new Error(response.status === 413
      ? "ภาพมีขนาดใหญ่เกินกว่าที่เซิร์ฟเวอร์รับได้ กรุณาครอปภาพแล้วลองใหม่"
      : `อ่านผลลัพธ์จากเซิร์ฟเวอร์ไม่สำเร็จ (${response.status})`);
  }
}

export function chartAnalysisError(error: unknown) {
  if (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError") {
    return "AI ใช้เวลานานเกินไป กรุณากดวิเคราะห์จากภาพอีกครั้ง";
  }
  return error instanceof Error ? error.message : "วิเคราะห์ภาพไม่สำเร็จ กรุณาลองใหม่";
}
