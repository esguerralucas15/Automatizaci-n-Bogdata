// Evita envíos y navegaciones duplicadas por doble clic: la segunda petición
// interrumpe la primera y puede dejar la sesión o el flujo en un estado inconsistente.
(() => {
  document.addEventListener("submit", (e) => {
    const form = e.target;
    if (form.dataset.enviando) {
      e.preventDefault();
      return;
    }
    form.dataset.enviando = "1";
    // Se deshabilita después del envío para que el valor del botón no se pierda
    setTimeout(() => form.querySelectorAll("button, [type=submit]").forEach((b) => (b.disabled = true)));
  });

  document.addEventListener("click", (e) => {
    const enlace = e.target.closest("a[href]");
    if (!enlace || e.ctrlKey || e.metaKey || e.shiftKey || enlace.target === "_blank") return;
    if (enlace.dataset.navegando) {
      e.preventDefault();
      return;
    }
    enlace.dataset.navegando = "1";
    // Las descargas (p. ej. el reporte PDF) no cambian de página: se libera el enlace
    setTimeout(() => delete enlace.dataset.navegando, 3000);
  });

  // Al volver con el botón "atrás" el navegador puede restaurar la página con los botones bloqueados
  window.addEventListener("pageshow", (e) => {
    if (!e.persisted) return;
    document.querySelectorAll("form[data-enviando]").forEach((f) => {
      delete f.dataset.enviando;
      f.querySelectorAll("button").forEach((b) => (b.disabled = false));
    });
    document.querySelectorAll("a[data-navegando]").forEach((a) => delete a.dataset.navegando);
  });
})();
