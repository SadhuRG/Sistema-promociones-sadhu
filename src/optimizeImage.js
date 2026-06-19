const IMAGE_UPLOAD_CONFIG = {
  maxWidth: 1200,
  maxHeight: 1600,
  webpQuality: 0.8,
  jpegQuality: 0.82,
};

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("No se pudo leer la imagen seleccionada."));
    };

    image.src = objectUrl;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("No se pudo comprimir la imagen."));
      },
      type,
      quality
    );
  });
}

function getTargetDimensions(width, height, maxWidth, maxHeight) {
  const widthRatio = maxWidth / width;
  const heightRatio = maxHeight / height;
  const ratio = Math.min(1, widthRatio, heightRatio);

  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function buildOptimizedFile(blob, originalName, extension, mimeType) {
  const baseName = originalName.replace(/\.[^.]+$/, "") || "imagen";

  return new File([blob], `${baseName}.${extension}`, {
    type: mimeType,
    lastModified: Date.now(),
  });
}

/**
 * Redimensiona y convierte a WebP (o JPEG si el navegador no soporta WebP)
 * antes de subir a Supabase. Reduce peso sin cambiar el flujo de negocio.
 */
export async function optimizeImageForUpload(file) {
  if (!file?.type?.startsWith("image/")) {
    throw new Error("El archivo seleccionado no es una imagen válida.");
  }

  const image = await loadImageFromFile(file);
  const { width, height } = getTargetDimensions(
    image.naturalWidth,
    image.naturalHeight,
    IMAGE_UPLOAD_CONFIG.maxWidth,
    IMAGE_UPLOAD_CONFIG.maxHeight
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("No se pudo procesar la imagen en este navegador.");
  }

  context.drawImage(image, 0, 0, width, height);

  let blob = await canvasToBlob(canvas, "image/webp", IMAGE_UPLOAD_CONFIG.webpQuality);
  let extension = "webp";
  let mimeType = "image/webp";

  if (!blob) {
    blob = await canvasToBlob(canvas, "image/jpeg", IMAGE_UPLOAD_CONFIG.jpegQuality);
    extension = "jpg";
    mimeType = "image/jpeg";
  }

  return buildOptimizedFile(blob, file.name, extension, mimeType);
}
