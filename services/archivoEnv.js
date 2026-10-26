// Escribe o reemplaza variables en el archivo .env sin tocar el resto (comentarios, orden)
import { readFile, writeFile } from "node:fs/promises";

export async function guardarEnEnv(valores, archivo = ".env") {
  let texto = await readFile(archivo, "utf8").catch(() => "");
  const salto = texto.includes("\r\n") ? "\r\n" : "\n";
  for (const [clave, valor] of Object.entries(valores)) {
    const linea = `${clave}=${valor}`;
    const re = new RegExp(`^${clave}=.*$`, "m");
    texto = re.test(texto) ? texto.replace(re, linea) : `${texto.replace(/\s*$/, "")}${salto}${linea}${salto}`;
  }
  await writeFile(archivo, texto, "utf8");
}
