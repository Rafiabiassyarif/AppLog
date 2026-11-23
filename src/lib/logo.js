// Logo aplikasi: gambar diperkecil di browser agar ringan disimpan dan dikirim.
export const LOGO_SIZE = 128;
export const LOGO_MAX_LENGTH = 80000; // sama dengan LIMITS.logo di server/validate.cjs
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'];

// Dibaca sebagai data URL (bukan blob:) karena CSP hanya mengizinkan img-src 'self' data:.
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const fail = () => reject(new Error('Gambar tidak bisa dibaca.'));
    const reader = new FileReader();
    reader.onerror = fail;
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = fail;
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/** Mengubah file gambar menjadi data URL persegi (maks. 128 px), gambar utuh di tengah. */
export async function logoFromFile(file) {
  if (!file || !ACCEPTED.includes(file.type)) throw new Error('Pilih gambar PNG, JPG, atau WebP.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Ukuran gambar maksimal 5 MB.');
  const image = await loadImage(file);
  for (const [size, quality] of [[LOGO_SIZE, 0.9], [LOGO_SIZE, 0.75], [96, 0.7], [64, 0.7]]) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight, 1);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    canvas.getContext('2d').drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
    let data = canvas.toDataURL('image/webp', quality);
    if (!data.startsWith('data:image/webp')) data = canvas.toDataURL('image/png');
    if (data.length <= LOGO_MAX_LENGTH) return data;
  }
  throw new Error('Logo terlalu rumit untuk diperkecil. Coba gambar lain.');
}
