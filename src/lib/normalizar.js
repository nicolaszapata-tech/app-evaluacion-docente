/** Sin tildes, minusculas, sin espacios de mas -- mismo criterio que
 *  normalizarTexto() en Apps Script (copiado de APP_GRUPOS_ACTIVOS). */
export function normalizar(texto) {
  return (texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}
