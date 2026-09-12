// Las fotos del celular pesan 2–5 MB y el tile las muestra a 72 px: se
// redimensionan en el navegador antes de subir (≤ 512 px, WebP) y el API
// guarda 15–40 KB por producto en vez de la foto original.
const MAX_SIDE = 512;

export function resizeImageForUpload(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (context === null) {
        reject(new Error('canvas no disponible'));
        return;
      }
      // Fondo blanco: los PNG con transparencia no quedan negros en WebP.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/webp', 0.85));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('no se pudo leer la imagen'));
    };
    image.src = url;
  });
}
