document.addEventListener("DOMContentLoaded", () => {
    const API = ""; // Base para futuras configuraciones
  
    // Cerrar sesión
    document.getElementById("logout")?.addEventListener("click", () => {
      sessionStorage.removeItem("user");
      location.href = 'login.html';
    });
  
    // Cargar analistas
    async function cargarAnalistas() {
      try {
        const res = await fetch(`${API}/analistas`);
        const list = await res.json();
        const sel = document.getElementById("analista");
        sel.innerHTML = "<option value=''>Seleccione un analista</option>";
        list.forEach(a => {
          const opt = document.createElement("option");
          opt.value = a._id;
          opt.textContent = a.username;
          sel.appendChild(opt);
        });
      } catch (err) {
        console.error("Error cargando analistas:", err);
        // Aquí podrías mostrar un mensaje en pantalla
      }
    }
  
    // Crear tarea
    document.getElementById("formTarea")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = {
        titulo:       document.getElementById("titulo").value.trim(),
        descripcion:  document.getElementById("descripcion").value.trim(),
        fechaHora:    document.getElementById("fechaHora").value,
        analista:     document.getElementById("analista").value,
        fechaLimite:  document.getElementById("fechaLimite").value,
        ticket:       document.getElementById("ticket").value.trim(),
        placa:        document.getElementById("placa").value.trim(),
        observacion:  document.getElementById("observacion").value.trim()
      };
      // Validación mínima
      if (!data.titulo || !data.descripcion || !data.fechaHora || !data.analista || !data.fechaLimite) {
        // Mostrar error en DOM en lugar de alert()
        return;
      }
      try {
        const res = await fetch(`${API}/tareas`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error();
        // Confirmación en UI y recarga
      } catch {
        console.error("Error al crear la tarea");
      }
    });
  
    // Llamadas iniciales
    cargarAnalistas();
  });
  