export function readImageAsDataUrl(
  file: File,
  maxDimension = 480,
  maxChars = 140000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("ไม่สามารถอ่านไฟล์รูปภาพได้"));
    reader.onload = () => {
      const result = String(reader.result || "");
      const img = new Image();
      img.onerror = () => resolve(result.slice(0, maxChars));
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(result.slice(0, maxChars));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          let quality = 0.72;
          let output = canvas.toDataURL("image/jpeg", quality);
          while (output.length > maxChars && quality > 0.22) {
            quality -= 0.12;
            output = canvas.toDataURL("image/jpeg", quality);
          }
          resolve(output);
        } catch {
          resolve(result.slice(0, maxChars));
        }
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const parts = dataUrl.split(",");
  if (parts.length !== 2) return null;
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
  try {
    const binary = atob(parts[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

export interface PhotoUploadResult {
  url: string;
  uploadedOnline: boolean;
  storage: "imgbb_cdn" | "server_storage" | "local_fallback";
}

export async function uploadPhoto(
  file: File,
  options?: {
    folder?: "products" | "colors" | "delivery" | "receipts" | "general";
    maxDimension?: number;
    maxFallbackChars?: number;
  }
): Promise<PhotoUploadResult> {
  const folder = options?.folder || "general";
  const maxDimension = options?.maxDimension ?? 960;
  const maxFallbackChars = options?.maxFallbackChars ?? 135000;

  // Compress image cleanly on client canvas first for fast mobile/online uploads
  const compressedDataUrl = await readImageAsDataUrl(
    file,
    maxDimension,
    Math.max(maxFallbackChars, 420000)
  );

  try {
    const blob = dataUrlToBlob(compressedDataUrl);
    let response: Response;

    if (blob) {
      const formData = new FormData();
      formData.append("photo", blob, `upload-${Date.now()}.jpg`);
      formData.append("folder", folder);
      response = await fetch("/api/upload-photo", {
        method: "POST",
        body: formData,
      });
    } else {
      response = await fetch("/api/upload-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataUrl: compressedDataUrl,
          folder,
        }),
      });
    }

    if (response.ok) {
      const data = (await response.json()) as {
        ok?: boolean;
        url?: string;
        storage?: "imgbb_cdn" | "server_storage";
      };
      if (data.ok && typeof data.url === "string" && data.url.length > 0) {
        return {
          url: data.url,
          uploadedOnline: true,
          storage: data.storage || "server_storage",
        };
      }
    }
  } catch {
    // Offline or API unreachable: fall back smoothly to compact inline thumbnail
  }

  const compactFallback = await readImageAsDataUrl(
    file,
    Math.min(maxDimension, 480),
    maxFallbackChars
  );
  return {
    url: compactFallback,
    uploadedOnline: false,
    storage: "local_fallback",
  };
}
