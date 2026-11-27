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
