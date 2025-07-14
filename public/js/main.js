document.addEventListener("DOMContentLoaded", () => {
  /* --------------------------------------------------------------------------
     0. Leer usuario de sesión y validación básica
  -------------------------------------------------------------------------- */
  const currentUser = JSON.parse(sessionStorage.getItem("user") || "{}");
  const path = location.pathname;
  const isAuthPage =
    path.endsWith("login.html") || path.endsWith("registro.html");
  const maxSessionTime = 30 * 60 * 1000;

  if (currentUser.id) {
    const loginTime = currentUser.loginTime || 0;
    const now = Date.now();

    if (now - loginTime > maxSessionTime) {
      console.warn("⏰ Sesión expirada");
      sessionStorage.removeItem("user");
      if (!isAuthPage) window.location.href = "login.html";
      return;
    } else {
      currentUser.loginTime = now;
      sessionStorage.setItem("user", JSON.stringify(currentUser));
    }
  }

  if (!currentUser.id && !isAuthPage) {
    return void (window.location.href = "login.html");
  }
  if (currentUser.id && isAuthPage) {
    return void (window.location.href = "index.html");
  }
  setInterval(() => {
    location.reload();
  }, 600 * 1000);
  /* --------------------------------------------------------------------------
     1. Menú usuario por hover
  -------------------------------------------------------------------------- */
  const profileIcon = document.querySelector(".nav-item.profile");
  const userDropdown = document.getElementById("user-dropdown");

  if (profileIcon && userDropdown) {
    profileIcon.addEventListener("click", (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle("hidden");
    });
    document.addEventListener("click", () => {
      userDropdown.classList.add("hidden");
    });

    userDropdown.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }
  /* --------------------------------------------------------------------------
     2. Ocultar “Control de Usuarios” para no-admin
  -------------------------------------------------------------------------- */
  const btnControl = document.querySelector(
    "button.sidebar-btn[onclick=\"mostrarSeccion('control-usuario')\"]"
  );
  if (btnControl && currentUser.rol !== "admin") {
    btnControl.style.display = "none";
  }
  /* --------------------------------------------------------------------------
     2.1 Validar sesión (login/registro)
  -------------------------------------------------------------------------- */
  const user = JSON.parse(sessionStorage.getItem("user") || "{}");
  const isAuth = path.endsWith("login.html") || path.endsWith("registro.html");

  if (!user.id && !isAuth) {
    return void (window.location.href = "login.html");
  }
  if (user.id && isAuth) {
    return void (window.location.href = "index.html");
  }

  /* --------------------------------------------------------------------------
     2. Toggle visibilidad de contraseña
  -------------------------------------------------------------------------- */
  document.querySelectorAll(".toggle-password").forEach((btn) => {
    btn.addEventListener("click", () => {
      const inp = btn.previousElementSibling;
      inp.type = inp.type === "password" ? "text" : "password";
      btn.querySelector(".material-icons").textContent =
        inp.type === "password" ? "visibility" : "visibility_off";
    });
  });

  /* --------------------------------------------------------------------------
     3. Constantes y utilidades
  -------------------------------------------------------------------------- */
  const API_BASE = "";
  const analistasMap = {};

  function addBusinessDays(date, days) {
    const res = new Date(date);
    let added = 0;
    while (added < days) {
      res.setDate(res.getDate() + 1);
      const d = res.getDay();
      if (d !== 0 && d !== 6) added++;
    }
    return res;
  }

  /* --------------------------------------------------------------------------
     4. Navegación entre secciones
  -------------------------------------------------------------------------- */
  window.mostrarSeccion = (id) => {
    document.querySelectorAll(".section").forEach((sec) => {
      sec.classList.toggle("active", sec.id === id);
      sec.classList.toggle("hidden", sec.id !== id);
    });
    if (id === "tareas") {
      cargarAnalistas();
      cargarTareas();
    }
    if (id === "crear-tarea") {
      initCrearTarea();
    }
    if (id === "control-usuario") {
      if (!usuariosYaCargados) {
        cargarUsuarios();
        usuariosYaCargados = true;
      }
    } else {
      usuariosYaCargados = false;
    }
  };

  window.manejarBotonVolver = () => {
    const actual = document.querySelector(".section.active")?.id;
    if (actual === "tareas" || actual === "crear-tarea") {
      mostrarSeccion("inicio");
    } else {
      mostrarSeccion("tareas");
    }
  };

  document.querySelectorAll(".sidebar-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const match = btn.getAttribute("onclick")?.match(/'(.+?)'/);
      if (match) mostrarSeccion(match[1]);
    });
  });

  function buildAuthHeaders() {
    const user = JSON.parse(sessionStorage.getItem("user") || "{}");

    return user?.id && user?.sessionToken
      ? {
          "x-user-id": user.id,
          "x-session-token": user.sessionToken,
        }
      : {};
  }

  async function secureFetch(url, options = {}) {
    const authHeaders = buildAuthHeaders();

    if (options.headers) {
      options.headers = { ...authHeaders, ...options.headers };
    } else {
      options.headers = authHeaders;
    }

    const res = await fetch(url, options);

    if (res.status === 401) {
      console.warn("⚠️ Sesión inválida detectada. Cerrando sesión.");
      sessionStorage.removeItem("user");
      window.location.href = "login.html";
      throw new Error("Sesión inválida");
    }

    return res;
  }

  /* --------------------------------------------------------------------------
     5.Login 
  -------------------------------------------------------------------------- */
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = document.getElementById("username").value.trim();
      const password = document.getElementById("password").value.trim();
      if (!username || !password) {
        return alert("Todos los campos son obligatorios");
      }
      try {
        const res = await fetch("/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });

        const data = await res.json();
        if (res.ok) {
          const userData = {
            id: data.user.id || data.user._id,
            username: data.user.username,
            rol: data.user.rol,
            sessionToken: data.user.sessionToken,
            loginTime: Date.now(), // 👈 clave para caducidad
          };
          sessionStorage.setItem("user", JSON.stringify(userData));
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
    formRegistro.addEventListener("submit", async (e) => {
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
        const res = await fetch(`${API_BASE}/registro`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: u, password: p }),
        });
        const data = await res.json();
        if (res.ok) {
          alert("✅ " + data.message);
          formRegistro.reset();
          setTimeout(() => (window.location.href = "login.html"), 1500);
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
    sessionStorage.removeItem("user");
    window.location.href = "login.html";
  });

  /* --------------------------------------------------------------------------
     8. Crear Tarea
  -------------------------------------------------------------------------- */
  function addBusinessDays(date, days) {
    const res = new Date(date);
    res.setDate(res.getDate() + days);
    return res;
  }

  function initCrearTarea() {
    const now = new Date();
    const localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    document.getElementById("fechaHora").value = localISO;
    document.getElementById("display-fechaHora").value = new Date(
      localISO
    ).toLocaleString();

    const businessDays = 3;
    const offset = businessDays - 1;
    const deadline = addBusinessDays(now, offset);
    const isoDate = deadline.toISOString().slice(0, 10);

    document.getElementById("fechaLimite").value = isoDate;
    document.getElementById("display-fechaLimite").value =
      deadline.toLocaleDateString();

    const textarea = document.getElementById("descripcion");
    const contador = document.getElementById("contador-descripcion");

    const campoObservacion = document.getElementById("observacion");
    const contadorObservacion = document.getElementById("contador-observacion");

    const campoReasignarObservacion = document.getElementById(
      "reasignar-observacion"
    );
    const contadorReasignarObservacion = document.getElementById(
      "contador-observacion-reasignar"
    );

    function actualizarContador() {
      contador.textContent = `${textarea.value.length} / 100`;
    }
    window.actualizarContador = actualizarContador;
    actualizarContador();
    textarea.addEventListener("input", actualizarContador);

    function actualizarContadorObservacion() {
      contadorObservacion.textContent = `${campoObservacion.value.length} / 100`;
    }
    actualizarContadorObservacion();
    campoObservacion.addEventListener("input", actualizarContadorObservacion);

    function actualizarContadorReasignarObservacion() {
      if (campoReasignarObservacion && contadorReasignarObservacion) {
        contadorReasignarObservacion.textContent = `${campoReasignarObservacion.value.length} / 100`;
      }
    }
    actualizarContadorReasignarObservacion();
    if (campoReasignarObservacion) {
      campoReasignarObservacion.addEventListener(
        "input",
        actualizarContadorReasignarObservacion
      );
    }

    cargarAnalistas();
  }

  const formTarea = document.getElementById("formTarea");
  if (formTarea) {
    formTarea.addEventListener("submit", async function (e) {
      e.preventDefault();

      let titulo = document.getElementById("titulo").value.trim().toUpperCase();
      const descripcion = document.getElementById("descripcion").value.trim();
      const observacion = document.getElementById("observacion").value.trim();
      const fechaHora = document.getElementById("fechaHora").value;
      const analista = document.getElementById("analista").value;
      const fechaLimite = document.getElementById("fechaLimite").value;
      const ticket = document.getElementById("ticket").value.trim();
      const placa = document.getElementById("placa").value.trim();

      // Solo los campos requeridos
      if (
        !titulo ||
        !descripcion ||
        !observacion ||
        !fechaHora ||
        !analista ||
        !fechaLimite ||
        !ticket ||
        !placa
      ) {
        return alert(
          "⚠️ Complete todos los campos obligatorios para guardar la actividad."
        );
      }

      if (descripcion.length < 100) {
        return alert("⚠️ La descripción debe tener al menos 100 caracteres.");
      }

      if (observacion && observacion.length < 100) {
        return alert(
          "⚠️ La observación debe tener al menos 100 caracteres si la incluye."
        );
      }

      const data = {
        titulo,
        descripcion,
        fechaHora,
        analista,
        fechaLimite,
        ticket,
        placa,
        observacion,
      };

      try {
        const res = await secureFetch(`${API_BASE}/tareas`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        });

        if (!res.ok) throw new Error();

        alert("✅ Tarea creada correctamente");
        cargarNotificaciones();
        this.reset();
        mostrarSeccion("tareas");
        cargarTareas();
      } catch (err) {
        console.error("❌ Error al crear la tarea:", err);
        alert("❌ Error al crear la tarea");
      }
    });
  }

  /* --------------------------------------------------------------------------
     9. Reasignar Tarea
  -------------------------------------------------------------------------- */
  window.abrirFormularioReasignar = async (id) => {
    try {
      const res = await secureFetch(`${API_BASE}/tareas/${id}`, {
        method: "GET",
      });
      const tarea = await res.json();

      const reasigns =
        tarea.historial?.filter((h) => h.accion === "Reasignación").length || 0;
      if (reasigns >= 2) {
        return alert("❌ Esta tarea ya ha sido reasignada dos veces");
      }

      const flHidden = document.getElementById("reasignar-fechaLimite");
      const originalISO = new Date(tarea.fechaLimite)
        .toISOString()
        .slice(0, 10);
      flHidden.value = originalISO;

      document.getElementById("display-reasignar-fechaLimite").value = new Date(
        tarea.fechaLimite
      ).toLocaleDateString();

      document.getElementById("formReasignar").dataset.id = id;
      mostrarSeccion("reasignar-tarea");
    } catch (err) {
      console.error("Error al abrir reasignar:", err);
      alert("❌ No se pudo obtener la tarea");
    }
  };

  const formReasignar = document.getElementById("formReasignar");
  if (formReasignar) {
    formReasignar.addEventListener("submit", async function (e) {
      e.preventDefault();
      const id = this.dataset.id;

      const analista_nuevo =
        document.getElementById("reasignar-analista").value;
      const fechaLimite = document.getElementById(
        "reasignar-fechaLimite"
      ).value;
      const observacion = document
        .getElementById("reasignar-observacion")
        .value.trim();

      // Validar campos obligatorios
      if (!analista_nuevo || !fechaLimite) {
        return alert("Complete todos los campos obligatorios");
      }
      // Observación mínimo 100 caracteres
      if (observacion.length < 100) {
        return alert("La observación debe tener al menos 100 caracteres");
      }

      const body = { analista_nuevo, fechaLimite, observacion };

      try {
        const res = await secureFetch(`${API_BASE}/tareas/reasignar/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || "Error desconocido");
        }

        alert("✅ Tarea reasignada correctamente");
        mostrarSeccion("tareas");
        cargarTareas();
        cargarNotificaciones();
      } catch (err) {
        console.error("❌ Error al reasignar la tarea:", err);
        alert("❌ Error al reasignar la tarea: " + err.message);
      }
    });
  }

  /* --------------------------------------------------------------------------
     10. Cargar Analistas, Tareas y Usuarios
  -------------------------------------------------------------------------- */
  async function cargarAnalistas() {
    try {
      const res = await secureFetch("/analistas", {
        method: "GET",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = await res.json();
      list.forEach((u) => (analistasMap[u._id] = u.username));

      const poblar = (id, placeholder) => {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = "";
        const opt0 = document.createElement("option");
        opt0.value = "";
        opt0.textContent = placeholder;
        sel.appendChild(opt0);
        list.forEach((u) => {
          const opt = document.createElement("option");
          opt.value = u._id;
          opt.textContent = u.username;
          sel.appendChild(opt);
        });
      };

      poblar("analista", "Seleccione un analista");
      poblar("reasignar-analista", "Seleccione un analista");
      poblar("filtro-analista", "Todos los analistas");
      poblar("informe-analista", "Todos los analistas");
    } catch (err) {
      console.error("❌ Error al cargar analistas:", err);
    }
  }

  /* --------------------------------------------------------------------------
     10. Cargar Tareas
  -------------------------------------------------------------------------- */
  let tareaSeleccionada = null;

  function mostrarFormularioAmpliarFecha(id) {
    tareaSeleccionada = id;

    const inputFecha = document.getElementById("nueva-fecha");
    if (!inputFecha) {
      console.error("El campo #nueva-fecha no existe en el DOM.");
      return;
    }

    inputFecha.value = "";
    document.getElementById("modal-ampliar-fecha").classList.remove("hidden");
  }

  function cerrarFormularioAmpliarFecha() {
    document.getElementById("modal-ampliar-fecha").classList.add("hidden");
    tareaSeleccionada = null;
  }

  async function enviarAmpliacion() {
    const nuevaFecha = document.getElementById("nueva-fecha").value;
    if (!nuevaFecha) {
      alert("Debes seleccionar una nueva fecha.");
      return;
    }

    try {
      const res = await secureFetch(
        `${API_BASE}/tareas/ampliar-fecha/${tareaSeleccionada}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nuevaFecha }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        alert(`❌ Error: ${err.error}`);
        return;
      }

      alert("✅ Fecha límite ampliada correctamente.");
      cerrarFormularioAmpliarFecha();
      cargarTareas(); // O mostrarTareasPaginadas(), si aplica
    } catch (err) {
      console.error("❌ Error al ampliar fecha:", err);
      alert("Error al conectar con el servidor.");
    }
  }

  window.mostrarFormularioAmpliarFecha = mostrarFormularioAmpliarFecha;
  window.cerrarFormularioAmpliarFecha = cerrarFormularioAmpliarFecha;
  window.enviarAmpliacion = enviarAmpliacion;

  const btnCancelar = document.getElementById("btnCancelarAmpliar");
  const btnConfirmar = document.getElementById("btnConfirmarAmpliar");

  if (btnCancelar) {
    btnCancelar.addEventListener("click", cerrarFormularioAmpliarFecha);
  }

  if (btnConfirmar) {
    btnConfirmar.addEventListener("click", enviarAmpliacion);
  }

  let currentPage = 1;
  const tasksPerPage = 5;
  let allTasks = [];

  function mostrarTareasPaginadas() {
    const tb = document.getElementById("listaTareas");
    tb.innerHTML = "";

    const start = (currentPage - 1) * tasksPerPage;
    const end = start + tasksPerPage;
    const paginatedTasks = allTasks.slice(start, end);

    paginatedTasks.forEach((t) => {
      const tr = document.createElement("tr");

      const now = new Date();
      if (t.estado === "Pendiente") {
        const due = new Date(t.fechaLimite);
        const msToDue = due - now;
        const daysToDue = msToDue / (1000 * 60 * 60 * 24);
        const overdue3 = addBusinessDays(due, 3);

        let clase;
        if (now > overdue3) {
          clase = "status-red";
        } else if (daysToDue <= 1 && daysToDue >= 0) {
          clase = "status-yellow";
        } else {
          clase = "status-green";
        }
        tr.classList.add(clase);
      }

      const acciones = [];

      if (t.estado === "Pendiente") {
        acciones.push(
          `<button onclick="terminarTarea('${t._id}')">Terminar</button>`
        );
        acciones.push(
          `<button onclick="abrirFormularioReasignar('${t._id}')">Reasignar</button>`
        );

        if (["admin", "jefe"].includes(currentUser.rol)) {
          acciones.push(
            `<button onclick="mostrarFormularioAmpliarFecha('${t._id}')">Ampliar Fecha</button>`
          );
        }
      }

      acciones.push(
        `<button onclick="verDetallesTarea('${t._id}')">Ver Detalles</button>`
      );
      tr.innerHTML = `
      <td>${t.titulo}</td>
      <td>${analistasMap[t.analista] || t.analista}</td>
      <td>${new Date(t.fechaHora).toLocaleString()}</td>
      <td>${t.estado || "Pendiente"}</td>
      <td class="filtros-botones">${acciones.join("")}</td>
    `;

      tb.appendChild(tr);
    });

    //- actualizar paginacion
    actualizarBotonesPaginacion();
  }

  function actualizarBotonesPaginacion() {
    const paginationContainer = document.getElementById("paginacionTareas");
    paginationContainer.innerHTML = "";

    const totalPages = Math.ceil(allTasks.length / tasksPerPage);

    const btnPrev = document.createElement("button");
    btnPrev.textContent = "Anterior";
    btnPrev.disabled = currentPage === 1;
    btnPrev.onclick = () => {
      currentPage--;
      mostrarTareasPaginadas();
    };
    paginationContainer.appendChild(btnPrev);

    const span = document.createElement("span");
    span.textContent = `Página ${currentPage} de ${totalPages}`;
    paginationContainer.appendChild(span);

    const btnNext = document.createElement("button");
    btnNext.textContent = "Siguiente";
    btnNext.disabled = currentPage === totalPages;
    btnNext.onclick = () => {
      currentPage++;
      mostrarTareasPaginadas();
    };
    paginationContainer.appendChild(btnNext);
  }

  async function cargarTareas() {
    if (!currentUser || !currentUser.id) {
      console.warn("⚠️ No hay sesión activa. No se cargarán tareas.");
      return;
    }
    try {
      const filtroAnalista = document.getElementById("filtro-analista").value;
      const params = filtroAnalista
        ? `?analista=${encodeURIComponent(filtroAnalista)}`
        : "";
      const res = await secureFetch(`${API_BASE}/tareas${params}`, {
        method: "GET",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const tareas = await res.json();

      allTasks = tareas.slice().sort((a, b) => {
        if (a.estado === b.estado) return 0;
        if (a.estado === "Pendiente") return -1;
        if (b.estado === "Pendiente") return 1;
        return 0;
      });
      currentPage = 1;
      mostrarTareasPaginadas();
    } catch (err) {
      console.error("Error al cargar tareas:", err);
      alert("❌ Error al cargar tareas");
    }
  }

  /* --------------------------------------------------------------------------
     10. Mostrar Tareas
  -------------------------------------------------------------------------- */
  function mostrarTareas(tareas) {
    const tb = document.getElementById("listaTareas");
    const now = new Date();
    tb.innerHTML = "";

    // 0) Ordenar: pendientes primero, luego el resto (manteniendo el orden relativo)
    const ordenadas = tareas.slice().sort((a, b) => {
      if (a.estado === b.estado) return 0;
      if (a.estado === "Pendiente") return -1;
      if (b.estado === "Pendiente") return 1;
      return 0;
    });

    // 1) Renderizar filas
    ordenadas.forEach((t) => {
      const tr = document.createElement("tr");

      // 2) Solo colorear si está pendiente
      if (t.estado === "Pendiente") {
        const due = new Date(t.fechaLimite);
        const msToDue = due - now;
        const daysToDue = msToDue / (1000 * 60 * 60 * 24);
        const overdue3 = addBusinessDays(due, 3);

        let clase;
        if (now > overdue3) {
          clase = "status-red"; // pasó +3 días hábiles
        } else if (daysToDue <= 1 && daysToDue >= 0) {
          clase = "status-yellow"; // queda 1 día o menos
        } else {
          clase = "status-green"; // sobra más de 1 día
        }
        tr.classList.add(clase);
      }
      // Si no está pendiente, queda sin color

      // 3) Poblamos las celdas
      tr.innerHTML = `
        <td>${t.titulo}</td>
        <td>${analistasMap[t.analista] || t.analista}</td>
        <td>${new Date(t.fechaHora).toLocaleString()}</td>
        <td>${t.estado || "Pendiente"}</td>
        <td class="filtros-botones">
          ${
            t.estado === "Pendiente"
              ? `<button onclick="terminarTarea('${t._id}')">Terminar</button>
               <button onclick="abrirFormularioReasignar('${t._id}')">Reasignar</button>`
              : ""
          }
          <button onclick="verDetallesTarea('${t._id}')">Ver Detalles</button>
        </td>`;
      tb.appendChild(tr);
    });
  }

  /* --------------------------------------------------------------------------
     10. Cargar Usuarios
  -------------------------------------------------------------------------- */
  async function cargarUsuarios() {
    const tbody = document.getElementById("listaUsuarios");
    if (!tbody) return;
    tbody.innerHTML = "";

    try {
      const res = await secureFetch(`${API_BASE}/usuarios`, {
        method: "GET",
      });
      let usuarios = await res.json();

      // Filtrar administradores y ordenar
      usuarios = usuarios
        .filter((u) => u.rol !== "admin")
        .sort((a, b) => a.username.localeCompare(b.username));

      // Conjunto para controlar IDs ya añadidos
      const added = new Set();

      usuarios.forEach((u) => {
        // Si ya añadimos este ID, lo saltamos
        if (added.has(u._id.toString())) return;
        added.add(u._id.toString());

        // Creación de fila
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${u.username}</td>
          <td>
            <select class="form-control role-select" data-user-id="${u._id}">
              <option value="analista" ${
                u.rol === "analista" ? "selected" : ""
              }>Analista</option>
              <option value="jefe"     ${
                u.rol === "jefe" ? "selected" : ""
              }>Jefe</option>
              <option value="admin"    ${
                u.rol === "admin" ? "selected" : ""
              }>Administrador</option>
            </select>
          </td>
          <td>${u.isActive ? "Activo" : "Inactivo"}</td>
          <td>
            <button onclick="editarUsuario('${u._id}','${
          u.username
        }')">✏️ Editar</button>
            <button onclick="restablecerClave('${u._id}')">🔑 Reset</button>
            <button onclick="toggleUsuario('${u._id}',${u.isActive})">
              ${u.isActive ? "🔒 Inactivar" : "✅ Activar"}
            </button>
          </td>`;
        tbody.appendChild(tr);
      });

      // Reasignar listeners a los selects de rol
      document.querySelectorAll(".role-select").forEach((sel) => {
        sel.addEventListener("change", async () => {
          const userId = sel.dataset.userId;
          const newRole = sel.value;
          try {
            const resp = await secureFetch(`${API_BASE}/usuarios/${userId}`, {
              method: "PUT",
              body: JSON.stringify({ rol: newRole }),
            });
            if (!resp.ok) throw new Error();
            alert(`✅ Rol actualizado a "${newRole}"`);
            cargarUsuarios();
          } catch {
            alert("❌ Error al actualizar el rol");
            cargarUsuarios();
          }
        });
      });
    } catch (err) {
      console.error("Error al cargar usuarios:", err);
      tbody.innerHTML = "";
      alert("❌ No se pudieron cargar los usuarios");
    }
  }

  /* --------------------------------------------------------------------------
     11. Ver detalles / historial
  -------------------------------------------------------------------------- */
  window.verDetallesTarea = async (id) => {
    try {
      const res = await secureFetch(`${API_BASE}/tareas/${id}`, {
        method: "GET",
      });
      const t = await res.json();
      const mapFields = [
        ["detalles-titulo", "titulo"],
        ["detalles-descripcion", "descripcion"],
        ["detalles-fechaHora", () => new Date(t.fechaHora).toLocaleString()],
        ["detalles-analista", () => analistasMap[t.analista] || t.analista],
        ["detalles-fechaLimite", "fechaLimite"],
        ["detalles-ticket", "ticket"],
        ["detalles-placa", "placa"],
        ["detalles-observacion", "observacion"],
        ["detalles-estado", () => t.estado || "Pendiente"],
      ];
      mapFields.forEach(([eid, val]) => {
        const el = document.getElementById(eid);
        if (el) el.value = typeof val === "function" ? val() : t[val];
      });
      const histTbody = document.getElementById("listaHistorial");
      histTbody.innerHTML = "";
      if (t.historial?.length) {
        t.historial.forEach((c) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${c.accion}</td>
            <td>${analistasMap[c.analista_anterior] || c.analista_anterior}</td>
            <td>${analistasMap[c.analista_nuevo] || c.analista_nuevo}</td>
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
  let tareaFinalizarId = null;

  window.terminarTarea = (id) => {
    tareaFinalizarId = id;
    document.getElementById("obs-finalizar").value = "";
    document.getElementById("contador-finalizar").textContent = "0 / 100";
    document.getElementById("btnConfirmarFinalizar").disabled = true;
    document.getElementById("modal-terminar-tarea").classList.remove("hidden");
  };

  const modalFinalizar = document.getElementById("modal-terminar-tarea");
  const obsInputFinalizar = document.getElementById("obs-finalizar");
  if (obsInputFinalizar) {
    const modalFinalizar = document.getElementById("modal-terminar-tarea");
    const contadorFinalizar = document.getElementById("contador-finalizar");
    const btnConfirmarFinalizar = document.getElementById(
      "btnConfirmarFinalizar"
    );
    const btnCancelarFinalizar = document.getElementById(
      "btnCancelarFinalizar"
    );

    obsInputFinalizar.addEventListener("input", () => {
      const length = obsInputFinalizar.value.length;
      contadorFinalizar.textContent = `${length} / 100`;
      btnConfirmarFinalizar.disabled = length < 100;
    });

    btnCancelarFinalizar.addEventListener("click", () => {
      modalFinalizar.classList.add("hidden");
      tareaFinalizarId = null;
    });

    btnConfirmarFinalizar.addEventListener("click", async () => {
      const observacion = obsInputFinalizar.value.trim();
      try {
        const res = await secureFetch(
          `${API_BASE}/tareas/terminar/${tareaFinalizarId}`,
          {
            method: "PUT",
            body: JSON.stringify({ observacion }),
          }
        );
        if (!res.ok) {
          const { error } = await res.json();
          throw new Error(error || "Error al finalizar tarea");
        }
        alert("✅ Tarea finalizada");
        modalFinalizar.classList.add("hidden");
        tareaFinalizarId = null;
        cargarTareas();
      } catch (err) {
        console.error(err);
        alert("❌ " + err.message);
      }
    });
  }

  /* --------------------------------------------------------------------------
     13. Filtros de tareas
  -------------------------------------------------------------------------- */
  document
    .getElementById("btnAplicarFiltros")
    ?.addEventListener("click", (e) => {
      e.preventDefault();
      aplicarFiltros();
    });
  document
    .getElementById("btnLimpiarFiltros")
    ?.addEventListener("click", (e) => {
      e.preventDefault();
      limpiarFiltros();
    });

  async function aplicarFiltros() {
    const params = new URLSearchParams();
    [
      "titulo",
      "ticket",
      "placa",
      "analista",
      "estado",
      "fecha-inicio",
      "fecha-fin",
    ].forEach((k) => {
      const el = document.getElementById(`filtro-${k}`);
      if (el?.value) params.append(k.replace("-", ""), el.value);
    });
    try {
      const res = await secureFetch(`${API_BASE}/tareas?${params}`, {
        method: "GET",
      });
      const tareas = await res.json();
      mostrarTareas(tareas);
    } catch (e) {
      console.error(e);
    }
  }

  function limpiarFiltros() {
    document
      .querySelectorAll(".filtros-campos input, .filtros-campos select")
      .forEach((el) => (el.value = ""));
    cargarTareas();
  }

  /* --------------------------------------------------------------------------
     NOtificaciones
  -------------------------------------------------------------------------- */
  const icon = document.getElementById("notif-icon");
  const dropdown = document.getElementById("notif-dropdown");

  icon.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("hidden");
  });

  document.addEventListener("click", () => {
    dropdown.classList.add("hidden");
  });

  cargarNotificaciones();

  async function cargarNotificaciones() {
    try {
      const res = await secureFetch(`${API_BASE}/notificaciones`, {
        method: "GET",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const asignadas = data.asignadas || [];

      const badge = document.getElementById("notif-badge");
      const dropdown = document.getElementById("notif-dropdown");

      // Badge
      if (asignadas.length > 0) {
        badge.textContent = asignadas.length;
        badge.classList.remove("hidden");
      } else {
        badge.classList.add("hidden");
      }

      // Lista
      dropdown.innerHTML = "";
      if (asignadas.length === 0) {
        const li = document.createElement("li");
        li.textContent = "No hay notificaciones";
        li.classList.add("notif-empty");
        dropdown.appendChild(li);
      } else {
        asignadas.forEach((t) => {
          const li = document.createElement("li");
          li.classList.add("notif-item");
          li.dataset.taskId = t._id; // guardamos id de tarea
          li.innerHTML = `
            <span class="material-icons">new_releases</span>
            <span>Actividad asignada: ${t.titulo}</span>`;
          li.addEventListener("click", async () => {
            // 1) Mostrar detalles
            mostrarSeccion("tareas");
            verDetallesTarea(t._id);
            li.remove();
            const remaining = dropdown.querySelectorAll("li.notif-item").length;
            if (remaining > 0) {
              badge.textContent = remaining;
            } else {
              badge.classList.add("hidden");
              dropdown.innerHTML = `<li class="notif-empty">No hay notificaciones</li>`;
            }

            try {
              await secureFetch(`${API_BASE}/notificaciones/leer/${t._id}`, {
                method: "PUT",
              });
            } catch (e) {
              console.warn("No se pudo notificar al server:", e);
            }
          });
          dropdown.appendChild(li);
        });
      }
    } catch (err) {
      console.error("Error cargando notificaciones:", err);
    }
  }

  /* --------------------------------------------------------------------------
     15. Control de Usuarios (editar / reset / toggle)
  -------------------------------------------------------------------------- */
  window.editarUsuario = async (id, oldName) => {
    const nuevo = prompt("Nuevo nombre de usuario:", oldName);
    if (!nuevo || nuevo === oldName) return;
    try {
      const res = await secureFetch(`${API_BASE}/usuarios/${id}`, {
        method: "PUT",
        body: JSON.stringify({ username: nuevo }),
      });
      if (!res.ok) throw new Error();
      alert("✅ Nombre actualizado");
      cargarUsuarios();
    } catch {
      alert("❌ No se pudo actualizar el usuario");
    }
  };

  window.restablecerClave = async (id) => {
    if (!confirm("¿Restablecer contraseña a valor por defecto?")) return;
    try {
      const res = await secureFetch(
        `${API_BASE}/usuarios/${id}/reset-password`,
        {
          method: "PUT",
        }
      );
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
      const res = await secureFetch(`${API_BASE}/usuarios/${id}/${accion}`, {
        method: "PUT",
      });
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

  const track = document.querySelector(".carousel-track");
  if (track) {
    const btnPrev = document.querySelector(".carousel-btn.prev");
    const btnNext = document.querySelector(".carousel-btn.next");
    const itemWidth = track
      .querySelector(".carousel-item")
      .getBoundingClientRect().width;
    let position = 0;

    btnNext.addEventListener("click", () => {
      const maxScroll = track.scrollWidth - track.clientWidth;
      position = Math.min(position + itemWidth + 16, maxScroll);
      track.style.transform = `translateX(-${position}px)`;
    });

    btnPrev.addEventListener("click", () => {
      position = Math.max(position - (itemWidth + 16), 0);
      track.style.transform = `translateX(-${position}px)`;
    });
  }

  function initInformes() {
    secureFetch("/analistas", { method: "GET" })
      .then((res) => res.json())
      .then((list) => {
        const sel = document.getElementById("informe-analista");
        sel.innerHTML = '<option value="">Todos los analistas</option>';
        list.forEach((u) => {
          const opt = document.createElement("option");
          opt.value = u._id;
          opt.textContent = u.username;
          sel.appendChild(opt);
        });
      })
      .catch((err) =>
        console.error("Error al cargar analistas para informe:", err)
      );

    const form = document.getElementById("formInformes");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const params = new URLSearchParams(new FormData(form));
      const url = `/tareas/informe?${params}`;

      try {
        const res = await secureFetch(url, {
          method: "GET",
          headers: {
            Accept:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const a = document.createElement("a");
        const href = URL.createObjectURL(blob);
        a.href = href;
        const fi = document.getElementById("informe-fecha-inicio").value;
        const ff = document.getElementById("informe-fecha-fin").value;
        a.download = `Informe_${fi}_a_${ff}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(href);
      } catch (err) {
        console.error("❌ Error al descargar Excel:", err);
        alert("No se pudo generar el informe. Intenta de nuevo.");
      }
    });
  }

  // 2) Llamar a initInformes() cuando entres a la sección de informes
  const oldMostrar = window.mostrarSeccion;
  window.mostrarSeccion = (id) => {
    oldMostrar(id);
    if (id === "informes") {
      initInformes();
    }
  };

  /* --------------------------------------------------------------------------
     17. Inicialización al abrir index.html
  -------------------------------------------------------------------------- */
  if (path.endsWith("index.html")) {
    cargarAnalistas();
    cargarTareas();
  }
});
