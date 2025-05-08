document.addEventListener("DOMContentLoaded", () => {
  /* --------------------------------------------------------------------------
     0. Menú de usuario por hover
  -------------------------------------------------------------------------- */
  const profileItem   = document.querySelector(".nav-item.profile");
  const userDropdown  = document.getElementById("user-dropdown");
  if (profileItem && userDropdown) {
    // oculto por defecto
    userDropdown.style.display = "none";
    profileItem.addEventListener("mouseenter", () => {
      userDropdown.style.display = "block";
    });
    profileItem.addEventListener("mouseleave", () => {
      userDropdown.style.display = "none";
    });
  }

  /* --------------------------------------------------------------------------
     1. Validar sesión (login/registro)
  -------------------------------------------------------------------------- */
  const user     = JSON.parse(localStorage.getItem("user") || "{}");
  const path     = location.pathname;
  const isAuth   = path.endsWith("login.html") || path.endsWith("registro.html");

  // Si intenta acceder sin estar logueado
  if (!user.id && !isAuth) {
    return void (window.location.href = "login.html");
  }
  // Si ya está logueado y va a login/registro
  if (user.id && isAuth) {
    return void (window.location.href = "index.html");
  }

  /* --------------------------------------------------------------------------
     2. Toggle visibilidad de contraseña (login/registro)
  -------------------------------------------------------------------------- */
  document.querySelectorAll(".toggle-password").forEach(btn => {
    btn.addEventListener("click", () => {
      const inp = btn.previousElementSibling;
      inp.type = inp.type === "password" ? "text" : "password";
      btn.querySelector(".material-icons")
         .textContent = inp.type === "password" ? "visibility" : "visibility_off";
    });
  });

  /* --------------------------------------------------------------------------
     3. Constantes y utilidades
  -------------------------------------------------------------------------- */
  const API_BASE     = "";            // base de las rutas
  const analistasMap = {};            // _id → username

  function addBusinessDays(date, days) {
    const res = new Date(date);
    let added = 0;
    while (added < days) {
      res.setDate(res.getDate() + 1);
      const d = res.getDay();
      // saltar fines de semana
      if (d !== 0 && d !== 6) added++;
    }
    return res;
  }

  /* --------------------------------------------------------------------------
     4. Navegación entre secciones
  -------------------------------------------------------------------------- */
  window.mostrarSeccion = id => {
    document.querySelectorAll(".section").forEach(sec => {
      sec.classList.toggle("active", sec.id === id);
      sec.classList.toggle("hidden", sec.id !== id);
    });
    // inicializaciones puntuales
    if (id === "tareas")         { cargarAnalistas(); cargarTareas(); }
    if (id === "crear-tarea")    { initCrearTarea(); }
    if (id === "control-usuario"){ cargarUsuarios(); }
  };

  window.manejarBotonVolver = () => {
    const actual = document.querySelector(".section.active")?.id;
    if (actual === "tareas" || actual === "crear-tarea") {
      mostrarSeccion("inicio");
    } else {
      mostrarSeccion("tareas");
    }
  };

  // Sidebar: todos los botones .sidebar-btn llaman a mostrarSeccion('id')
  document.querySelectorAll(".sidebar-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      // extraer la sección del onclick inline:
      const match = btn.getAttribute("onclick")?.match(/'(.+?)'/);
      if (match) mostrarSeccion(match[1]);
    });
  });

  /* --------------------------------------------------------------------------
     5. Login
  -------------------------------------------------------------------------- */
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async e => {
      e.preventDefault();
      const username = document.getElementById("username").value.trim();
      const password = document.getElementById("password").value.trim();
      if (!username || !password) {
        return alert("Todos los campos son obligatorios");
      }
      try {
        const res  = await fetch(`${API_BASE}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (res.ok) {
          localStorage.setItem("user", JSON.stringify(data.user));
          window.location.href = "index.html";
        } else {
          alert("❌ " + (data.error || "Credenciales incorrectas"));
        }
      } catch {
        alert("❌ Error al iniciar sesión");
      }
    });
  }

  /* --------------------------------------------------------------------------
     6. Registro
  -------------------------------------------------------------------------- */
  const formRegistro = document.getElementById("formRegistro");
  if (formRegistro) {
    formRegistro.addEventListener("submit", async e => {
      e.preventDefault();
      const u = document.getElementById("regUsername").value.trim();
      const p = document.getElementById("regPassword").value.trim();
      const c = document.getElementById("confirmPassword").value.trim();
      if (!u || !p || !c) {
        return alert("Todos los campos son obligatorios");
      }
      if (p !== c) {
        return alert("Las contraseñas no coinciden");
      }
      try {
        const res  = await fetch(`${API_BASE}/registro`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: u, password: p })
        });
        const data = await res.json();
        if (res.ok) {
          alert("✅ " + data.message);
          formRegistro.reset();
          setTimeout(() => window.location.href = "login.html", 1500);
        } else {
          throw new Error(data.error);
        }
      } catch (err) {
        alert("❌ " + err.message);
      }
    });
  }

  /* --------------------------------------------------------------------------
     7. Logout
  -------------------------------------------------------------------------- */
  document.getElementById("btnCerrarSesion")?.addEventListener("click", () => {
    localStorage.removeItem("user");
    window.location.href = "login.html";
  });

  /* --------------------------------------------------------------------------
     8. Crear Tarea
  -------------------------------------------------------------------------- */
  function initCrearTarea() {
    // fechaHora = ahora
    const fh = document.getElementById("fechaHora");
    if (fh) {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      fh.value = now.toISOString().slice(0,16);
    }
    // fechaLimite = hoy → hoy+3 días hábiles
    const fl = document.getElementById("fechaLimite");
    if (fl) {
      const today = new Date();
      fl.min   = today.toISOString().slice(0,10);
      fl.max   = addBusinessDays(today, 3).toISOString().slice(0,10);
      fl.value = fl.min;
    }
    cargarAnalistas();
  }

  const formTarea = document.getElementById("formTarea");
  if (formTarea) {
    formTarea.addEventListener("submit", async function(e) {
      e.preventDefault();
      const data = {
        titulo:      document.getElementById("titulo").value.trim(),
        descripcion: document.getElementById("descripcion").value.trim(),
        fechaHora:   document.getElementById("fechaHora").value,
        analista:    document.getElementById("analista").value,
        fechaLimite: document.getElementById("fechaLimite").value,
        ticket:      document.getElementById("ticket").value.trim(),
        placa:       document.getElementById("placa").value.trim(),
        observacion: document.getElementById("observacion").value.trim()
      };
      if (!data.titulo || !data.descripcion || !data.fechaHora || !data.analista || !data.fechaLimite) {
        return alert("Complete todos los campos obligatorios");
      }
      try {
        const res = await fetch(`${API_BASE}/tareas`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error();
        alert("✅ Tarea creada correctamente");
        this.reset();
        mostrarSeccion("tareas");
        cargarTareas();
      } catch {
        alert("❌ Error al crear la tarea");
      }
    });
  }

  /* --------------------------------------------------------------------------
     9. Reasignar Tarea
  -------------------------------------------------------------------------- */
  window.abrirFormularioReasignar = async id => {
    try {
      const res   = await fetch(`${API_BASE}/tareas/${id}`);
      const tarea = await res.json();
      if (tarea.historial?.some(h => h.accion === "Reasignación")) {
        return alert("❌ Esta tarea ya ha sido reasignada una vez");
      }
      const fl = document.getElementById("reasignar-fechaLimite");
      const today = new Date();
      fl.min   = today.toISOString().slice(0,10);
      fl.max   = addBusinessDays(today, 3).toISOString().slice(0,10);
      fl.value = fl.min;
      document.getElementById("formReasignar").dataset.id = id;
      mostrarSeccion("reasignar-tarea");
    } catch {
      alert("❌ No se pudo obtener la tarea");
    }
  };

  const formReasignar = document.getElementById("formReasignar");
  if (formReasignar) {
    formReasignar.addEventListener("submit", async function(e) {
      e.preventDefault();
      const id = this.dataset.id;
      const body = {
        analista_nuevo: document.getElementById("reasignar-analista").value,
        fechaLimite:    document.getElementById("reasignar-fechaLimite").value,
        observacion:    document.getElementById("reasignar-observacion").value.trim()
      };
      if (!body.analista_nuevo || !body.fechaLimite || !body.observacion) {
        return alert("Complete todos los campos obligatorios");
      }
      try {
        const res = await fetch(`${API_BASE}/tareas/reasignar/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error();
        alert("✅ Tarea reasignada correctamente");
        mostrarSeccion("tareas");
        cargarTareas();
      } catch {
        alert("❌ Error al reasignar la tarea");
      }
    });
  }

  /* --------------------------------------------------------------------------
     10. Cargar Analistas, Tareas y Usuarios
  -------------------------------------------------------------------------- */
    async function cargarAnalistas() {
    try {
      const res = await fetch('/analistas');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = await res.json();
      console.log("🔔 Lista de analistas recibida:", list);
  
      // Mapeo para luego mostrar en tablas, etc.
      list.forEach(u => analistasMap[u._id] = u.username);
  
      // Helper para vaciar y rellenar un <select> dado su id y texto del placeholder
      const poblar = (id, placeholder) => {
        const sel = document.getElementById(id);
        if (!sel) return;              // no existe en esta pantalla, ok
        sel.innerHTML = '';
        const opt0 = document.createElement('option');
        opt0.value = '';
        opt0.textContent = placeholder;
        sel.appendChild(opt0);
        list.forEach(u => {
          const opt = document.createElement('option');
          opt.value = u._id;
          opt.textContent = u.username;
          sel.appendChild(opt);
        });
      };
  
      // Asegurarnos de poblar TODOS los selects que uses
      poblar('analista', 'Seleccione un analista');
      poblar('reasignar-analista', 'Seleccione un analista');
      poblar('filtro-analista', 'Todos los analistas');
      poblar('informe-analista', 'Todos los analistas');
    } catch (err) {
      console.error("❌ Error al cargar analistas:", err);
    }
  }
  

  async function cargarTareas() {
    const tb = document.getElementById("listaTareas");
    if (!tb) return;
    try {
      const res    = await fetch(`${API_BASE}/tareas`);
      const tareas = await res.json();
      mostrarTareas(tareas);
    } catch (err) {
      console.error("Error al cargar tareas:", err);
      alert("❌ Error al cargar tareas");
    }
  }

  function mostrarTareas(tareas) {
    const tb = document.getElementById("listaTareas");
    tb.innerHTML = "";
    tareas.forEach(t => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${t.titulo}</td>
        <td>${analistasMap[t.analista]||t.analista}</td>
        <td>${new Date(t.fechaHora).toLocaleString()}</td>
        <td>${t.estado||"Pendiente"}</td>
        <td>
          ${t.estado==="Pendiente"
            ? `<button onclick="terminarTarea('${t._id}')">Terminar</button>
               <button onclick="abrirFormularioReasignar('${t._id}')">Reasignar</button>`
            : ""}
          <button onclick="verDetallesTarea('${t._id}')">Ver Detalles</button>
        </td>`;
      tb.appendChild(tr);
    });
  }

  async function cargarUsuarios() {
    const tbody = document.getElementById("listaUsuarios");
    if (!tbody) return;
    tbody.innerHTML = "";
  
    try {
      // 1) Obtengo todos los usuarios
      const res      = await fetch(`${API_BASE}/usuarios`);
      let usuarios   = await res.json();
  
      // 3) Quito los admin y ordeno
      usuarios = usuarios
        .filter(u => u.rol !== "admin")
        .sort((a, b) => a.username.localeCompare(b.username));
  
      // 4) Renderizo la tabla
      usuarios.forEach(u => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${u.username}</td>
          <td>${u.rol}</td>
          <td>${u.isActive ? "Activo" : "Inactivo"}</td>
          <td>
            <button onclick="editarUsuario('${u._id}','${u.username}')">✏️ Editar</button>
            <button onclick="restablecerClave('${u._id}')">🔑 Reset</button>
            <button onclick="toggleUsuario('${u._id}',${u.isActive})">
              ${u.isActive ? "🔒 Inactivar" : "✅ Activar"}
            </button>
          </td>`;
        tbody.appendChild(tr);
      });
    } catch (err) {
      console.error("Error al cargar usuarios:", err);
      alert("❌ No se pudieron cargar los usuarios");
    }
  }
  

  /* --------------------------------------------------------------------------
     11. Ver detalles / historial
  -------------------------------------------------------------------------- */
  window.verDetallesTarea = async id => {
    try {
      const res = await fetch(`${API_BASE}/tareas/${id}`);
      const t   = await res.json();
      // rellenar campos de detalle...
      const mapFields = [
        ["detalles-titulo",     "titulo"],
        ["detalles-descripcion","descripcion"],
        ["detalles-fechaHora",  ()=>new Date(t.fechaHora).toLocaleString()],
        ["detalles-analista",   ()=>analistasMap[t.analista]||t.analista],
        ["detalles-fechaLimite","fechaLimite"],
        ["detalles-ticket",     "ticket"],
        ["detalles-placa",      "placa"],
        ["detalles-observacion","observacion"],
        ["detalles-estado",     ()=>t.estado||"Pendiente"]
      ];
      mapFields.forEach(([eid,val]) => {
        const el = document.getElementById(eid);
        if (el) el.value = typeof val==="function" ? val() : t[val];
      });
      // historial
      const histTbody = document.getElementById("listaHistorial");
      histTbody.innerHTML = "";
      if (t.historial?.length) {
        t.historial.forEach(c => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${c.accion}</td>
            <td>${analistasMap[c.analista_anterior]||c.analista_anterior}</td>
            <td>${analistasMap[c.analista_nuevo]||c.analista_nuevo}</td>
            <td>${new Date(c.fecha).toLocaleString()}</td>
            <td>${new Date(c.fechaLimite_nueva).toLocaleString()}</td>
            <td>${c.observacion}</td>`;
          histTbody.appendChild(tr);
        });
      } else {
        histTbody.innerHTML = `<tr><td colspan="6">No hay historial de cambios</td></tr>`;
      }
      mostrarSeccion("detalles-tarea");
    } catch (err) {
      console.error("Error al cargar detalles:", err);
      alert("❌ Error al cargar detalles de la tarea");
    }
  };

  /* --------------------------------------------------------------------------
     12. Terminar Tarea (añade comentario)
  -------------------------------------------------------------------------- */
  window.terminarTarea = async id => {
    const obs = prompt("Deja un comentario sobre lo realizado:");
    if (obs === null) return;
    try {
      const res = await fetch(`${API_BASE}/tareas/terminar/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observacion: obs.trim() })
      });
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || "Error al finalizar tarea");
      }
      alert("✅ Tarea finalizada");
      cargarTareas();
    } catch (err) {
      console.error(err);
      alert("❌ " + err.message);
    }
  };

  /* --------------------------------------------------------------------------
     13. Filtros de tareas
  -------------------------------------------------------------------------- */
  document.getElementById("btnAplicarFiltros")?.addEventListener("click", e => {
    e.preventDefault(); aplicarFiltros();
  });
  document.getElementById("btnLimpiarFiltros")?.addEventListener("click", e => {
    e.preventDefault(); limpiarFiltros();
  });

  async function aplicarFiltros() {
    const params = new URLSearchParams();
    ["titulo","ticket","placa","analista","estado","fecha-inicio","fecha-fin"]
      .forEach(k => {
        const el = document.getElementById(`filtro-${k}`);
        if (el?.value) params.append(k.replace("-",""), el.value);
      });
    try {
      const res = await fetch(`${API_BASE}/tareas?${params}`);
      const tareas = await res.json();
      mostrarTareas(tareas);
    } catch (e) {
      console.error(e);
    }
  }

  function limpiarFiltros() {
    document.querySelectorAll(".filtros-campos input, .filtros-campos select")
      .forEach(el => el.value = "");
    cargarTareas();
  }

  /* --------------------------------------------------------------------------
     14. Permisos y dropdown de notificaciones
  -------------------------------------------------------------------------- */
  // ocultar control-usuario a no-admin
  if (user.rol !== "admin") {
    document.getElementById("link-control-usuario")?.classList.add("hidden");
  }

  // notificaciones
  async function cargarNotificaciones() {
    try {
      const res  = await fetch(`${API_BASE}/notificaciones`, {
        headers: { "x-user-id": user.id }
      });
      const data = await res.json();
      const total = (data.asignadas?.length||0)
                  + (data.completadas?.length||0)
                  + (data.porVencer?.length||0);
      const badge = document.getElementById("notif-badge");
      badge.textContent = total || "";
      badge.classList.toggle("hidden", total === 0);

      const drop  = document.getElementById("notif-dropdown");
      drop.innerHTML = "";
      [...(data.asignadas||[]),
       ...(data.completadas||[]),
       ...(data.porVencer||[])]
        .forEach(t => {
          const li = document.createElement("li");
          if (data.asignadas?.includes(t))   li.textContent = `🆕 Asignada: ${t.titulo}`;
          else if (data.completadas?.includes(t)) {
            li.textContent = `✅ Finalizada: ${t.titulo}`;
            li.style.color = "#4CAF50";
          } else {
            li.textContent = `⌛ Por vencer: ${t.titulo}`;
            li.style.color = "#e67e22";
          }
          drop.appendChild(li);
        });
    } catch (err) {
      console.error("Error notif:", err);
    }
  }

  const notifIcon = document.getElementById("notif-icon");
  const notifDrop = document.getElementById("notif-dropdown");
  notifIcon?.addEventListener("click", e => {
    e.stopPropagation(); notifDrop.classList.toggle("hidden");
  });
  document.addEventListener("click", () => notifDrop?.classList.add("hidden"));
  cargarNotificaciones();

  /* --------------------------------------------------------------------------
     15. Control de Usuarios (editar / reset / toggle)
  -------------------------------------------------------------------------- */
  window.editarUsuario = async (id, oldName) => {
    const nuevo = prompt("Nuevo nombre de usuario:", oldName);
    if (!nuevo || nuevo === oldName) return;
    try {
      const res = await fetch(`${API_BASE}/usuarios/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: nuevo })
      });
      if (!res.ok) throw new Error();
      alert("✅ Nombre actualizado");
      cargarUsuarios();
    } catch {
      alert("❌ No se pudo actualizar el usuario");
    }
  };

  window.restablecerClave = async id => {
    if (!confirm("¿Restablecer contraseña a valor por defecto?")) return;
    try {
      const res = await fetch(`${API_BASE}/usuarios/${id}/reset-password`, { method: "PUT" });
      if (!res.ok) throw new Error();
      alert("✅ Contraseña restablecida");
    } catch {
      alert("❌ Error al restablecer contraseña");
    }
  };

  window.toggleUsuario = async (id, isActive) => {
    const accion = isActive ? "inactivar" : "activar";
    if (!confirm(`¿Desea ${accion} este usuario?`)) return;
    try {
      const res = await fetch(`${API_BASE}/usuarios/${id}/${accion}`, { method: "PUT" });
      if (!res.ok) throw new Error();
      alert(`✅ Usuario ${accion}do`);
      cargarUsuarios();
    } catch {
      alert(`❌ Error al ${accion} usuario`);
    }
  };

  /* --------------------------------------------------------------------------
     16. Generar Informe
  -------------------------------------------------------------------------- */
  const formInformes = document.getElementById("formInformes");
  if (formInformes) {
    formInformes.addEventListener("submit", e => {
      e.preventDefault();
      const params = new URLSearchParams();
      const fi = document.getElementById("informe-fecha-inicio").value;
      const ff = document.getElementById("informe-fecha-fin").value;
      const an = document.getElementById("informe-analista").value;
      const es = document.getElementById("informe-estado").value;
      if (fi) params.append("fechaInicio", fi);
      if (ff) params.append("fechaFin", ff);
      if (an) params.append("analista", an);
      if (es) params.append("estado", es);
      window.location.href = `/tareas/informe?${params}`;
    });
  }

  /* --------------------------------------------------------------------------
     17. Inicialización al abrir index.html
  -------------------------------------------------------------------------- */
  if (path.endsWith("index.html")) {
    cargarAnalistas();
    cargarTareas();
  }
});
