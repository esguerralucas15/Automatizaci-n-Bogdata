// Menú hamburguesa y modal de éxito
(() => {
  const app = document.body;
  const btnMenu = document.getElementById("btnMenu");
  const overlay = document.getElementById("sidebarOverlay");
  const esMovil = () => window.matchMedia("(max-width: 900px)").matches;

  btnMenu?.addEventListener("click", () => {
    const clase = esMovil() ? "sidebar-abierto" : "sidebar-oculto";
    const activo = app.classList.toggle(clase);
    btnMenu.setAttribute("aria-expanded", String(esMovil() ? activo : !activo));
  });
  overlay?.addEventListener("click", () => app.classList.remove("sidebar-abierto"));

  const modal = document.getElementById("modalExito");
  if (modal) {
    const cerrar = () => modal.classList.add("is-cerrado");
    modal.querySelector("[data-cerrar-modal]").addEventListener("click", cerrar);
    modal.addEventListener("click", (e) => { if (e.target === modal) cerrar(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrar(); });
    modal.querySelector("[data-cerrar-modal]").focus();
  }
})();
