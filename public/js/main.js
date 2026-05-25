document.addEventListener("DOMContentLoaded", () => {
  /* --------------------------------------------------------------------------
     0. Leer usuario de sesión y validación básica
  -------------------------------------------------------------------------- */
  const currentUser = JSON.parse(sessionStorage.getItem("user") || "{}");
  const path = location.pathname;
  const isAuthPage = path.endsWith("/login") || path.endsWith("/registro");
  const maxSessionTime = 30 * 60 * 1000;

  if (currentUser.id) {
    const loginTime = currentUser.loginTime || 0;
    const now = Date.now();

    if (now - loginTime > maxSessionTime) {
      console.warn("⏰ Sesión expirada");
      sessionStorage.removeItem("user");
      if (!isAuthPage) window.location.href = "/login";
      return;
    } else {
      currentUser.loginTime = now;
      sessionStorage.setItem("user", JSON.stringify(currentUser));
    }
  }

  if (!currentUser.id && !isAuthPage) {
    return void (window.location.href = "/login");
  }
  if (currentUser.id && isAuthPage) {
    return void (window.location.href = "/");
  }

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
     2. Ocultar contrtol usuario
  -------------------------------------------------------------------------- */
  const btnControl =
    document.querySelector(
      "button.sidebar-btn[onclick=\"mostrarSeccion('control-usuarios')\"]",
    ) ||
    document.querySelector(
      "button.sidebar-btn[onclick=\"mostrarSeccion('control-usuario')\"]",
    );

  const canManageUsers = ["admin", "jefe"].includes(currentUser?.rol);

  if (btnControl) {
    btnControl.style.display = canManageUsers ? "" : "none";
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
  const __baseMostrarSeccion = (id) => {
    document.querySelectorAll(".section").forEach((sec) => {
      sec.classList.toggle("active", sec.id === id);
      sec.classList.toggle("hidden", sec.id !== id);
    });

    if (id === "tareas") {
      cargarAnalistas();
      cargarTareas();
    } else if (id === "crear-tarea") {
      initCrearTarea();
    } else if (id === "control-usuario") {
      if (!window.__usuariosYaCargados) {
        cargarUsuarios();
        window.__usuariosYaCargados = true;
      }
    } else {
      window.__usuariosYaCargados = false;
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
    const user = JSON.parse(sessionStorage.getItem("user") || "{}");
    const authHeaders =
      user?.id && user?.sessionToken
        ? {
            "x-user-id": user.id,
            "x-session-token": user.sessionToken,
          }
        : {};

    // Combinar headers
    options.headers = {
      "Content-Type": "application/json",
      ...authHeaders,
      ...options.headers,
    };

    const res = await fetch(url, options);

    if (res.status === 401) {
      console.warn("⚠️ Sesión inválida detectada. Cerrando sesión.");
      sessionStorage.removeItem("user");
      window.location.href = "/login";
      throw new Error("Sesión inválida");
    }
    return res;
  }

  //----- FECHAS

  function formatearFecha(fecha) {
    if (!fecha) return "";

    const f = new Date(fecha);

    return new Date(
      f.getTime() + f.getTimezoneOffset() * 60000,
    ).toLocaleDateString("es-CO");
  }

  // ===== MOSTRAR SECCIÓN
  window.mostrarSeccion = async function (id) {
    __baseMostrarSeccion(id);

    // INFORMES
    if (id === "informes") {
      try {
        initInformes?.();
      } catch (e) {
        console.error("Error initInformes:", e);
      }
    }

    // PLAN DE MANTENIMIENTO
    if (id === "plan-mantenimiento") {
      try {
        await initMantenimiento?.();
        bindFormPlan?.();
        cargarAnalistasPlan?.();
      } catch (e) {
        console.error("Error plan mantenimiento:", e);
      }
    }

    function bindUbicacionesEquipos() {
      const piso = document.getElementById("eq-piso");
      const area = document.getElementById("eq-area");

      if (!piso || !area) return;

      piso.addEventListener("change", (e) => {
        console.log("📍 Piso cambiado:", e.target.value);
        cargarAreas(e.target.value);
      });

      area.addEventListener("change", (e) => {
        console.log("🏢 Área cambiada:", e.target.value);
        cargarSubareas(e.target.value);
      });
    }

    // EQUIPOS
    if (id === "inventario") {
      try {
        bindFormEquipo?.();

        requestAnimationFrame(async () => {
          await cargarPisos();
          await cargarPisosFiltros();
          bindUbicacionesEquipos?.();
          cargarEquipos?.();
        });

        bindFiltrosEquipos?.();
      } catch (e) {
        console.error("Error equipos:", e);
      }
    }

    // INICIO (CALENDARIO + TAREAS)
    if (id === "inicio") {
      const calendarEl = document.getElementById("calendar");

      try {
        if (!window.__calendarRef && calendarEl) {
          const currentUser = JSON.parse(
            sessionStorage.getItem("user") || "{}",
          );

          const resp = await secureFetch(`/tareas?analista=${currentUser.id}`, {
            method: "GET",
          });
          const tareas = await resp.json();
          initCalendarioTareas(tareas);
        }
      } catch (e) {
        console.error("Error cargando calendario:", e);
      }

      requestAnimationFrame(() => {
        try {
          window.__calendarRef?.updateSize?.();
        } catch {}
      });

      try {
        cargarTareas?.();
      } catch {}
    }
  };

  /* --------------------------------------------------------------------------
     5.Login 
  -------------------------------------------------------------------------- */
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      e.stopPropagation();
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
            loginTime: Date.now(),
          };
          sessionStorage.setItem("user", JSON.stringify(userData));
          window.location.href = "/";
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
          setTimeout(() => (window.location.href = "/login"), 1500);
        } else {
          throw new Error(data.error);
        }
      } catch (err) {
        alert("❌ " + err.message);
      }
    });
  }

  /* --------------------------------------------------------------------------
   6.5 RESTABLECER CONTRASEÑA
-------------------------------------------------------------------------- */
  const formResetPassword = document.getElementById("formResetPassword");

  if (formResetPassword) {
    formResetPassword.addEventListener("submit", async (e) => {
      e.preventDefault();

      const password = document.getElementById("resetPassword").value.trim();

      const confirmPassword = document
        .getElementById("confirmPassword")
        .value.trim();

      const errorContainer = document.getElementById("resetPasswordError");

      errorContainer.textContent = "";

      if (!password || !confirmPassword) {
        return (errorContainer.textContent =
          "Todos los campos son obligatorios");
      }

      if (password.length < 6) {
        return (errorContainer.textContent =
          "La contraseña debe tener mínimo 6 caracteres");
      }

      if (password !== confirmPassword) {
        return (errorContainer.textContent = "Las contraseñas no coinciden");
      }

      try {
        // Obtener token desde URL
        const params = new URLSearchParams(window.location.search);
        const token = params.get("token");

        if (!token) {
          return (errorContainer.textContent = "Token inválido o expirado");
        }

        const res = await fetch(`${API_BASE}/reset-password`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token,
            password,
          }),
        });

        const data = await res.json();

        if (res.ok) {
          alert("✅ Contraseña restablecida correctamente");

          formResetPassword.reset();

          setTimeout(() => {
            window.location.href = "/login";
          }, 1500);
        } else {
          errorContainer.textContent =
            data.error || "Error al restablecer contraseña";
        }
      } catch (error) {
        console.error(error);

        errorContainer.textContent = "Error del servidor, intenta nuevamente";
      }
    });
  }

  /* --------------------------------------------------------------------------
     7. Logout
  -------------------------------------------------------------------------- */
  document.getElementById("btnCerrarSesion")?.addEventListener("click", () => {
    sessionStorage.removeItem("user");
    window.location.href = "/login";
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
      localISO,
    ).toLocaleString();

    const businessDays = 3;
    const offset = businessDays - 1;
    const deadline = addBusinessDays(now, offset);
    const isoDate = new Date(
      deadline.getTime() - deadline.getTimezoneOffset() * 60000,
    )
      .toISOString()
      .slice(0, 10);

    document.getElementById("fechaLimite").value = isoDate;
    document.getElementById("display-fechaLimite").value =
      formatearFecha(deadline);

    const textarea = document.getElementById("descripcion");
    const contador = document.getElementById("contador-descripcion");

    const campoObservacion = document.getElementById("observacion");
    const contadorObservacion = document.getElementById("contador-observacion");

    const campoReasignarObservacion = document.getElementById(
      "reasignar-observacion",
    );
    const contadorReasignarObservacion = document.getElementById(
      "contador-observacion-reasignar",
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
        actualizarContadorReasignarObservacion,
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
          "⚠️ Complete todos los campos obligatorios para guardar la actividad.",
        );
      }

      if (descripcion.length < 100) {
        return alert("⚠️ La descripción debe tener al menos 100 caracteres.");
      }

      if (observacion && observacion.length < 100) {
        return alert(
          "⚠️ La observación debe tener al menos 100 caracteres si la incluye.",
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

      document.getElementById("display-reasignar-fechaLimite").value =
        formatearFecha(tarea.fechaLimite);

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
        "reasignar-fechaLimite",
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
        },
      );

      if (!res.ok) {
        const err = await res.json();
        alert(`❌ Error: ${err.error}`);
        return;
      }

      alert("✅ Fecha límite ampliada correctamente.");
      cerrarFormularioAmpliarFecha();
      cargarTareas();

      const seccionDetalles = document.querySelector(
        "#detalles-tarea.section.active",
      );
      if (seccionDetalles) {
        verDetallesTarea(tareaSeleccionada);
      }
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

  // - Mostrar actividades
  let currentPage = 1;
  let tasksPerPage = calcularTasksPorPantalla();
  let allTasks = [];

  function mostrarTareasPaginadas() {
    tasksPerPage = calcularTasksPorPantalla();

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
          `<button onclick="terminarTarea('${t._id}')">Terminar</button>`,
        );
        acciones.push(
          `<button onclick="abrirFormularioReasignar('${t._id}')">Reasignar</button>`,
        );

        if (["admin", "jefe"].includes(currentUser.rol)) {
          acciones.push(
            `<button onclick="mostrarFormularioAmpliarFecha('${t._id}')">Aplazar</button>`,
          );
        }
      }

      acciones.push(
        `<button onclick="verDetallesTarea('${t._id}')">Detalles</button>`,
      );
      tr.innerHTML = `
      <td>${t.titulo}</td>
      <td>${
        t.analista?.username || analistasMap[t.analista] || "Sin asignar"
      }</td>
      <td>${formatearFecha(t.fechaHora)}</td>
      <td>${t.estado || "Pendiente"}</td>
      <td class="filtros-botones">${acciones.join("")}</td>
    `;

      tb.appendChild(tr);
    });

    //- actualizar paginacion
    actualizarBotonesPaginacion();
  }

  function calcularTasksPorPantalla() {
    const tableContainer = document.querySelector(".table-container");
    if (!tableContainer) return 8;
    const containerHeight = tableContainer.clientHeight;
    const rowHeight = 48;
    const reservedSpace = 60;
    const filas = Math.floor((containerHeight - reservedSpace) / rowHeight);
    // Seguridad: mínimo y máximo
    return Math.max(5, Math.min(filas, 20));
  }

  window.addEventListener("resize", () => {
    tasksPerPage = calcularTasksPorPantalla();
    currentPage = 1;
    mostrarTareasPaginadas();
  });

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
        if (a.estado === "Pendiente" && b.estado !== "Pendiente") return -1;
        if (a.estado !== "Pendiente" && b.estado === "Pendiente") return 1;
        const fechaA = new Date(a.fechaHora);
        const fechaB = new Date(b.fechaHora);
        return fechaB - fechaA;
      });
      currentPage = 1;
      mostrarTareasPaginadas();

      if (document.getElementById("calendar")) {
        initCalendarioTareas(allTasks);
      }

      if (document.getElementById("lista-pendientes")) {
        mostrarPendientesWidget(allTasks);
      }
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
      if (a.estado === "Pendiente" && b.estado !== "Pendiente") return -1;
      if (a.estado !== "Pendiente" && b.estado === "Pendiente") return 1;
      const fechaA = new Date(a.fechaHora);
      const fechaB = new Date(b.fechaHora);
      return fechaB - fechaA;
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

      // 3) Poblamos las celdas
      tr.innerHTML = `
        <td>${t.titulo}</td>
        <td>${analistasMap[t.analista] || t.analista}</td>
        <td>${formatearFecha(t.fechaHora)}</td>
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
            <input class="tg-input" data-user-id="${
              u._id
            }" placeholder="chat id" value="${
              u.telegramChatId || ""
            }" style="width: 140px" />
            <button class="tg-save" data-user-id="${u._id}">Guardar</button>
          </td>
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

      document.querySelectorAll(".tg-save").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const userId = btn.dataset.userId;
          const input = document.querySelector(
            `.tg-input[data-user-id="${userId}"]`,
          );
          const chatId = (input?.value || "").trim();
          try {
            const resp = await secureFetch(
              `${API_BASE}/usuarios/${userId}/telegram`,
              {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ telegramChatId: chatId }),
              },
            );
            if (!resp.ok) throw new Error();
            alert("✅ Telegram actualizado");
          } catch (e) {
            alert("❌ No se pudo guardar el Telegram chat id");
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
        ["detalles-fechaHora", () => formatearFecha(t.fechaHora)],
        [
          "detalles-analista",
          () =>
            t.analista?.username || analistasMap[t.analista] || "Sin asignar",
        ],
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
            <td>${formatearFecha(c.fecha)}</td>
            <td>${formatearFecha(c.fechaLimite_nueva)}</td>
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
      "btnConfirmarFinalizar",
    );
    const btnCancelarFinalizar = document.getElementById(
      "btnCancelarFinalizar",
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
          },
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
    const mapKeys = {
      titulo: "titulo",
      ticket: "ticket",
      placa: "placa",
      analista: "analista",
      estado: "estado",
      "fecha-inicio": "fechaInicio",
      "fecha-fin": "fechaFin",
    };

    const params = new URLSearchParams();
    Object.entries(mapKeys).forEach(([inputKey, queryKey]) => {
      const el = document.getElementById(`filtro-${inputKey}`);
      const val = el?.value?.trim();
      if (val) params.append(queryKey, val);
    });

    try {
      const res = await secureFetch(`${API_BASE}/tareas?${params.toString()}`, {
        method: "GET",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const tareas = await res.json();

      const ordenadas = (Array.isArray(tareas) ? tareas : []).sort((a, b) => {
        const da = new Date(a.fechaHora || a.createdAt || 0).getTime();
        const db = new Date(b.fechaHora || b.createdAt || 0).getTime();
        return db - da; // más nuevas primero
      });

      allTasks = Array.isArray(tareas) ? tareas : [];
      currentPage = 1;
      mostrarTareasPaginadas();
    } catch (e) {
      console.error("❌ Error aplicando filtros:", e);
      alert("No se pudieron aplicar los filtros.");
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
    const nuevaClave = prompt("Ingrese la nueva contraseña:");
    if (!nuevaClave || nuevaClave.trim().length < 6) {
      alert("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    try {
      const res = await secureFetch(
        `${API_BASE}/usuarios/${id}/reset-password`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ password: nuevaClave }),
        },
      );

      if (!res.ok) throw new Error();
      alert("Contraseña restablecida correctamente");
    } catch {
      alert("Error al restablecer contraseña");
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
        console.error("Error al cargar analistas para informe:", err),
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

  /* --------------------------------------------------------------------------
   GENERAR INFORME MANTENIMIENTOS
-------------------------------------------------------------------------- */

  function initInformeMantenimientos() {
    const form = document.getElementById("formInformeMantenimientos");

    if (!form) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const params = new URLSearchParams(new FormData(form));

      const url = `/equipos/informe?${params}`;

      try {
        const res = await secureFetch(url, {
          method: "GET",
          headers: {
            Accept:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const blob = await res.blob();

        const a = document.createElement("a");

        const href = URL.createObjectURL(blob);

        a.href = href;

        const fi = document.getElementById("mantenimiento-fecha-inicio").value;

        const ff = document.getElementById("mantenimiento-fecha-fin").value;

        a.download = `Informe_Mantenimientos_${fi}_a_${ff}.xlsx`;

        document.body.appendChild(a);

        a.click();

        a.remove();

        URL.revokeObjectURL(href);
      } catch (err) {
        console.error("❌ Error al descargar informe:", err);

        alert("No se pudo generar el informe.");
      }
    });
  }

  /* --------------------------------------------------------------------------
     10. Mostrar Tareas
  -------------------------------------------------------------------------- */
  window.__calendarRef = null;

  function initCalendarioTareas(tareas) {
    const calendarEl = document.getElementById("calendar");
    if (!calendarEl) return;

    if (calendarEl._fullCalendar) {
      calendarEl._fullCalendar.destroy();
    }

    const calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: "dayGridMonth",
      locale: "es",
      height: 450,
      contentHeight: 450,
      dayMaxEventRows: true,
      moreLinkClick: "popover",
      headerToolbar: {
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth,timeGridWeek",
      },

      eventDidMount(info) {
        info.el.style.cursor = "pointer";
      },
      dayCellDidMount(info) {
        info.el.classList.add("is-day-clickable");
      },
      dateClick(info) {},
      events: tareas.map((t) => ({
        title: t.titulo,
        start: t.fechaHora,
        end: t.fechaLimite,
        color: t.estado === "Finalizado" ? "#81c784" : "#ffb74d",
        extendedProps: {
          id: t._id,
          analista: t.analista,
          estado: t.estado,
        },
      })),

      eventClick(info) {
        const id = info.event.extendedProps.id;
        verDetallesTarea(id);
      },
    });

    calendar.render();
    calendarEl._fullCalendar = calendar;
    window.__calendarRef = calendar;
  }

  /* --------------------------------------------------------------------------
   Mostrar actividades pendientes
-------------------------------------------------------------------------- */
  function mostrarPendientesWidget(tareas) {
    const contenedor = document.getElementById("lista-pendientes");
    if (!contenedor) return;

    const pendientes = tareas
      .filter((t) => t.estado === "Pendiente")
      .sort((a, b) => new Date(a.fechaHora) - new Date(b.fechaHora));

    contenedor.innerHTML = "";

    if (pendientes.length === 0) {
      contenedor.innerHTML = `<li>✅ No hay tareas pendientes</li>`;
      return;
    }

    pendientes.forEach((t) => {
      const fecha = formatearFecha(t.fechaHora);
      const responsable = t.analista?.username || "Sin asignar";

      const li = document.createElement("li");
      li.style.cursor = "pointer";
      li.title = "Ver detalle";

      li.innerHTML = `
      <strong>${responsable}</strong><br/>
      <span>${t.titulo}</span><br/>
      <small>${fecha}</small>
    `;

      li.addEventListener("click", () => verDetallesTarea(t._id));

      contenedor.appendChild(li);
    });
  }

  /* --------------------------------------------------------------------------
   Crear plan mensual
-------------------------------------------------------------------------- */
  function monthRange(year, month /*1-12*/) {
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59));
    return { start, end };
  }

  async function pickNightAnalysts() {
    const list = await Usuario.find({ rol: "analista" }, "username")
      .limit(4)
      .lean();
    if (list.length < 4) return list;
    return list;
  }

  // ================== MANTENIMIENTO  ==================

  async function initMantenimiento() {
    if (initMantenimiento.__iniciado) return;
    initMantenimiento.__iniciado = true;

    bindFormPlan?.();
    bindFiltrosEquipos?.();

    await cargarEquipos();
    actualizarEstadisticas?.();
  }

  function initInformeMantenimientos() {
    const form = document.getElementById("formInformeMantenimientos");

    if (!form) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      try {
        const fechaInicio = document.getElementById(
          "mantenimiento-fecha-inicio",
        ).value;

        const fechaFin = document.getElementById(
          "mantenimiento-fecha-fin",
        ).value;

        const params = new URLSearchParams();

        if (fechaInicio) {
          params.append("fechaInicio", fechaInicio);
        }

        if (fechaFin) {
          params.append("fechaFin", fechaFin);
        }

        const user = JSON.parse(sessionStorage.getItem("user"));

        const res = await fetch(`/equipos/informe?${params.toString()}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${user.sessionToken}`,
          },
        });

        if (!res.ok) {
          throw new Error("Error generando informe");
        }

        const blob = await res.blob();

        const url = window.URL.createObjectURL(blob);

        const a = document.createElement("a");

        a.href = url;

        a.download = "Informe_Mantenimientos.xlsx";

        document.body.appendChild(a);

        a.click();

        a.remove();

        window.URL.revokeObjectURL(url);
      } catch (err) {
        console.error("❌ Error informe:", err);

        alert("No se pudo generar el informe");
      }
    });
  }

  // ==================== FORMULARIO EQUIPO ====================

  async function guardarEquipo(e) {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
      e.stopPropagation();
    }

    console.log("🔧 Iniciando guardarEquipo");

    const form = document.getElementById("form-equipo");
    if (!form) {
      console.error("❌ Formulario no encontrado");
      return false;
    }

    // ===== VALIDACIONES =====
    const errores = [];

    const marca = document.getElementById("eq-marca")?.value.trim();
    const modelo = document.getElementById("eq-modelo")?.value.trim();
    const serial = document.getElementById("eq-serial")?.value.trim();
    const placa = document.getElementById("eq-placa")?.value.trim();
    const tipo = document.getElementById("eq-tipo")?.value.trim();
    const pisoSel = document.getElementById("eq-piso");
    const areaSel = document.getElementById("eq-area");
    const subSel = document.getElementById("eq-subarea");

    const ubicacion = {
      piso: pisoSel.options[pisoSel.selectedIndex]?.text || "",
      area: areaSel.options[areaSel.selectedIndex]?.text || "",
      subarea: subSel.value ? subSel.options[subSel.selectedIndex]?.text : null,
    };

    const dominio = document.getElementById("eq-dominio")?.value.trim();
    const fechaCompra = document.getElementById("eq-compra")?.value;

    if (!marca) errores.push("La marca es obligatoria");
    if (!modelo) errores.push("El modelo es obligatorio");
    if (!serial) errores.push("El serial es obligatorio");
    if (!ubicacion.piso) errores.push("El piso es obligatorio");
    if (!ubicacion.area) errores.push("El área es obligatoria");
    if (!dominio) errores.push("El dominio es obligatorio");
    if (!fechaCompra) errores.push("La fecha de compra es obligatoria");

    if (errores.length > 0) {
      mostrarNotificacion(errores.join("\n"), "error");
      return false;
    }

    console.log("📅 Fecha compra value:", fechaCompra);

    // ===== PAYLOAD =====
    const payload = {
      marca,
      modelo,
      serial,
      placa,
      tipo,
      ubicacion,
      dominio,
      fechaCompra,
      ultimoMantenimientoFecha:
        document.getElementById("eq-ult-fecha")?.value || null,
      ultimoMantenimientoPor:
        document.getElementById("eq-ult-por")?.value || null,
      ultimoMantenimientoCambios:
        document.getElementById("eq-ult-cambios")?.value.trim() || "",
    };

    console.log("📤 Payload:", payload);

    const id = form.dataset.id;
    const method = id ? "PUT" : "POST";
    const url = id ? `/equipos/${id}` : `/equipos`;

    const btn = form.querySelector('button[type="submit"]');
    const originalText = btn ? btn.textContent : "";

    if (btn) {
      btn.disabled = true;
      btn.textContent = "Guardando...";
    }

    try {
      console.log(`🌐 Enviando: ${method} ${url}`);

      const res = await secureFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      console.log("📥 Respuesta:", res.status);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData?.error || `Error ${res.status}`);
      }

      const data = await res.json();
      console.log(" Equipo guardado:", data);

      mostrarNotificacion(
        ` Equipo ${id ? "actualizado" : "creado"} correctamente`,
        "success",
      );

      function limpiarFormularioEquipo() {
        const form = document.getElementById("form-equipo");
        if (!form) return;

        form.reset();
        delete form.dataset.id;

        const btn = form.querySelector('button[type="submit"]');
        if (btn) btn.textContent = "Guardar Equipo";

        console.log("🧹 Formulario de equipo limpiado");
      }

      limpiarFormularioEquipo();
      await cargarEquipos();
      actualizarEstadisticas();
    } catch (err) {
      console.error("❌ Error en guardarEquipo:", err);
      mostrarNotificacion(`❌ ${err.message}`, "error");
    } finally {
      if (btn) {
        btn.disabled = false;
      }
    }

    return false;
  }

  // ==================== CARGAR Y RENDERIZAR EQUIPOS ====================

  async function cargarEquipos() {
    console.log("📦 Cargando equipos...");

    const tbody = document.getElementById("tbl-equipos");
    if (!tbody) return;

    tbody.innerHTML = `
    <tr>
      <td colspan="6" style="text-align:center;">Cargando equipos...</td>
    </tr>
  `;

    try {
      const res = await secureFetch(`/equipos`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      console.log("📥 Respuesta equipos:", res.status);

      if (!res.ok) {
        throw new Error(`Error ${res.status}`);
      }

      const data = await res.json();
      console.log(` ${data.length} equipos cargados`);

      equiposData = Array.isArray(data) ? data : [];
      renderEquipos(equiposData);
      actualizarEstadisticas();
    } catch (err) {
      console.error("❌ Error cargando equipos:", err);
      tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; color:#ef4444;">
          ❌ Error cargando equipos: ${err.message}
        </td>
      </tr>
    `;
      mostrarNotificacion(`❌ Error cargando equipos: ${err.message}`, "error");
    }
  }

  function renderEquipos(lista) {
    const tbody = document.getElementById("tbl-equipos");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (!Array.isArray(lista) || lista.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6" style="text-align:center;">No hay equipos registrados</td></tr>';
      return;
    }

    lista.forEach((equipo) => {
      const tr = document.createElement("tr");

      const compra = equipo.fechaCompra
        ? new Date(equipo.fechaCompra).toLocaleDateString("es-CO")
        : "—";

      const proximo = equipo.proximoMantenimiento
        ? formatearFechaConEstado(equipo.proximoMantenimiento)
        : "—";

      const ultimo = equipo.ultimoMantenimientoFecha
        ? new Date(equipo.ultimoMantenimientoFecha).toLocaleDateString("es-CO")
        : "—";

      const estadoClase = obtenerEstadoMantenimiento(
        equipo.proximoMantenimiento,
      );
      if (estadoClase) tr.classList.add(estadoClase);

      function formatearUbicacion(u) {
        if (!u) return "—";
        return [u.piso, u.area, u.subarea].filter(Boolean).join(" / ");
      }

      tr.innerHTML = `
    <!-- 1. Equipo -->
    <td>
      ${equipo.marca || "—"}<br/>
      ${equipo.modelo || ""}
    </td>

    <!-- 2. Serial / Placa -->
    <td>
      ${equipo.serial || "—"}
      ${equipo.placa ? `<br/>Placa: ${equipo.placa}` : ""}
    </td>

    <!-- 3. Ubicación -->
    <td>${formatearUbicacion(equipo.ubicacion)}</td>

    <!-- 4. Dominio -->
    <td>${equipo.dominio || "—"}</td>

    <!-- 5. Fecha compra -->
    <td>${compra}</td>

    <!-- 6. Próximo mantenimiento -->
    <td>${proximo}</td>

    <!-- 7. Último mantenimiento -->
    <td>${ultimo}</td>

    <!-- 8. Acciones -->
    <td class="filtros-botones">
      <button type="button" class="btn-editar" data-id="${equipo._id}">
        <span class="material-icons">edit</span>
      </button>
      <button type="button" class="btn-eliminar" data-id="${equipo._id}">
        <span class="material-icons">delete</span>
      </button>
    </td>
  `;

      // listeners
      const btnEdit = tr.querySelector(".btn-editar");
      const btnDel = tr.querySelector(".btn-eliminar");
      if (btnEdit)
        btnEdit.addEventListener("click", () => editarEquipo(equipo));
      if (btnDel)
        btnDel.addEventListener("click", () =>
          eliminarEquipo(equipo._id, equipo.nombre),
        );

      tbody.appendChild(tr);
    });
  }

  function formatearFechaConEstado(fecha) {
    const d = new Date(fecha);
    const texto = d.toLocaleDateString("es-CO");
    const hoy = new Date();
    const diff = Math.ceil((d - hoy) / (1000 * 60 * 60 * 24));

    if (diff < 0)
      return `<span style="color:#ef4444;">${texto} (Vencido)</span>`;
    if (diff <= 30)
      return `<span style="color:#f59e0b;">${texto} (Próximo)</span>`;
    return texto;
  }

  function obtenerEstadoMantenimiento(fecha) {
    if (!fecha) return null;

    const d = new Date(fecha);
    const hoy = new Date();
    const diff = Math.ceil((d - hoy) / (1000 * 60 * 60 * 24));

    if (diff < 0) return "status-red";
    if (diff <= 30) return "status-yellow";
    return null;
  }

  //EDITAR EQUIPO

  document.addEventListener("submit", (e) => {
    if (!e.target || e.target.id !== "form-equipo") return;

    // Botón cancelar no debe enviar
    if (e.submitter?.classList.contains("btn-cancelar")) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    guardarEquipo(e);
  });

  function editarEquipo(equipo) {
    equipoEnEdicion = equipo;

    document.getElementById("eq-marca").value = equipo.marca || "";
    document.getElementById("eq-modelo").value = equipo.modelo || "";
    document.getElementById("eq-serial").value = equipo.serial || "";
    document.getElementById("eq-placa").value = equipo.placa || "";
    document.getElementById("eq-dominio").value = equipo.dominio || "";
    document.getElementById("eq-compra").value = equipo.fechaCompra
      ? equipo.fechaCompra.slice(0, 10)
      : "";

    document.getElementById("eq-ult-fecha").value =
      equipo.ultimoMantenimientoFecha
        ? equipo.ultimoMantenimientoFecha.slice(0, 10)
        : "";
    document.getElementById("eq-ult-por").value =
      equipo.ultimoMantenimientoPor || "";
    document.getElementById("eq-ult-cambios").value =
      equipo.ultimoMantenimientoCambios || "";

    const form = document.getElementById("form-equipo");
    form.dataset.id = equipo._id;

    const btnSubmit = form.querySelector('button[type="submit"]');
    const btnCancelar = form.querySelector(".btn-cancelar");

    btnSubmit.textContent = "Actualizar Equipo";
    btnSubmit.style.display = "inline-flex";

    if (btnCancelar) {
      btnCancelar.style.display = "inline-flex";
    }

    precargarUbicacion(equipo);
  }

  async function precargarUbicacion(equipo) {
    if (!equipo.ubicacion) return;

    const pisoSel = document.getElementById("eq-piso");
    const areaSel = document.getElementById("eq-area");
    const subSel = document.getElementById("eq-subarea");

    // Seleccionar piso por texto
    const pisoOpt = [...pisoSel.options].find(
      (o) =>
        o.text.trim().toLowerCase() ===
        equipo.ubicacion.piso.trim().toLowerCase(),
    );
    if (!pisoOpt) return;

    pisoSel.value = pisoOpt.value;
    await cargarAreas(pisoOpt.value);

    // Seleccionar área
    const areaOpt = [...areaSel.options].find(
      (o) =>
        o.text.trim().toLowerCase() ===
        equipo.ubicacion.area.trim().toLowerCase(),
    );
    if (!areaOpt) return;

    areaSel.value = areaOpt.value;
    await cargarSubareas(areaOpt.value);

    // Seleccionar subárea (si existe)
    if (equipo.ubicacion.subarea) {
      const subOpt = [...subSel.options].find(
        (o) =>
          o.text.trim().toLowerCase() ===
          equipo.ubicacion.subarea.trim().toLowerCase(),
      );
      if (subOpt) subSel.value = subOpt.value;
    }
  }

  //document.getElementById("btn-cancelar-equipo")?.classList.remove("hidden");

  // CANCELAR EDICIÓN EQUIPO

  window.cancelarEdicionEquipo = function (e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    console.log("🚫 Edición de equipo cancelada");

    const form = document.getElementById("form-equipo");
    if (!form) return;

    // Limpiar formulario
    form.reset();

    // Quitar modo edición
    equipoEnEdicion = null;
    delete form.dataset.id;

    // Restaurar botón submit
    const btnSubmit = form.querySelector('button[type="submit"]');
    if (btnSubmit) {
      btnSubmit.textContent = "Agregar Equipo";
      btnSubmit.classList.remove("btn-actualizar");
      btnSubmit.classList.add("btn-guardar");
      btnSubmit.disabled = false;
    }

    /*// Ocultar botón cancelar
    const btnCancelar = form.querySelector(".btn-cancelar");
    if (btnCancelar) {
      btnCancelar.style.display = "none";
    }*/

    // Reset selects
    document.getElementById("eq-area").innerHTML =
      '<option value="">Seleccione área</option>';
    document.getElementById("eq-area").disabled = true;

    document.getElementById("eq-subarea").innerHTML =
      '<option value="">Seleccione subárea</option>';
    document.getElementById("eq-subarea").disabled = true;

    cargarEquipos();
  };

  // ELIMINAR EQUIPO
  async function eliminarEquipo(id, nombre) {
    const confirmar = confirm(
      `🗑️ Eliminar equipo\n\n` +
        `Vas a eliminar el siguiente equipo:\n` +
        `"${nombre}"\n\n` +
        `⚠️ Esta acción es permanente y no se puede deshacer.\n\n` +
        `¿Deseas continuar?`,
    );

    if (!confirmar) return;

    try {
      const res = await secureFetch(`/equipos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al eliminar equipo");

      const form = document.getElementById("form-equipo");
      if (form && form.dataset.id === id) {
        cancelarEdicionEquipo();
      }

      mostrarNotificacion("Equipo eliminado correctamente", "success");
      await cargarEquipos();
      actualizarEstadisticas();
    } catch (err) {
      console.error("Error al eliminar:", err);
      mostrarNotificacion("No se pudo eliminar el equipo", "error");
    }
  }

  // ==================== FILTROS DE EQUIPOS ====================

  function bindFiltrosEquipos() {
    const filtroNombre = document.getElementById("filtro-equipo-nombre");
    const filtroSerial = document.getElementById("filtro-equipo-serial");
    const filtroPlaca = document.getElementById("filtro-equipo-placa");
    const filtroEstado = document.getElementById("filtro-equipo-estado");
    const filtroPiso = document.getElementById("filtro-piso");
    const filtroArea = document.getElementById("filtro-area");
    const filtroSubarea = document.getElementById("filtro-subarea");

    if (filtroNombre)
      filtroNombre.addEventListener("input", aplicarFiltrosEquipos);

    if (filtroSerial)
      filtroSerial.addEventListener("input", aplicarFiltrosEquipos);

    if (filtroPlaca)
      filtroPlaca.addEventListener("input", aplicarFiltrosEquipos);

    if (filtroEstado)
      filtroEstado.addEventListener("change", aplicarFiltrosEquipos);

    if (filtroPiso)
      filtroPiso.addEventListener("change", aplicarFiltrosEquipos);

    if (filtroArea)
      filtroArea.addEventListener("change", aplicarFiltrosEquipos);

    if (filtroSubarea)
      filtroSubarea.addEventListener("change", aplicarFiltrosEquipos);
  }

  function aplicarFiltrosEquipos() {
    const nombre =
      document.getElementById("filtro-equipo-nombre")?.value.toLowerCase() ||
      "";

    const serial =
      document.getElementById("filtro-equipo-serial")?.value.toLowerCase() ||
      "";

    const placa =
      document.getElementById("filtro-equipo-placa")?.value.toLowerCase() || "";

    const estado = document.getElementById("filtro-equipo-estado")?.value || "";

    const piso = document.getElementById("filtro-piso")?.value || "";

    const area = document.getElementById("filtro-area")?.value || "";

    const subarea = document.getElementById("filtro-subarea")?.value || "";

    const filtrados = equiposData.filter((e) => {
      const matchNombre =
        !nombre || (e.dominio && e.dominio.toLowerCase().includes(nombre));

      const matchSerial = !serial || e.serial?.toLowerCase().includes(serial);

      const matchPlaca = !placa || e.placa?.toLowerCase().includes(placa);

      let matchEstado = true;

      if (estado === "vencido") {
        matchEstado =
          e.proximoMantenimiento &&
          new Date(e.proximoMantenimiento) < new Date();
      }

      if (estado === "proximo") {
        const diff = Math.ceil(
          (new Date(e.proximoMantenimiento) - new Date()) /
            (1000 * 60 * 60 * 24),
        );
        matchEstado = diff >= 0 && diff <= 30;
      }

      const matchPiso = !piso || e.piso === piso;

      const matchArea = !area || e.area === area;

      const matchSubarea = !subarea || e.subarea === subarea;

      return (
        matchNombre &&
        matchSerial &&
        matchEstado &&
        matchPiso &&
        matchArea &&
        matchSubarea &&
        matchPlaca
      );
    });

    renderEquipos(filtrados);
  }

  // ==================== PLAN MENSUAL ====================

  function bindFormPlan() {
    if (document.__planBound) return;

    console.log("✅ bindFormPlan (delegado) ACTIVADO");

    document.addEventListener("submit", (e) => {
      if (e.target && e.target.id === "form-plan-mensual") {
        console.log("📨 submit capturado (delegado)");
        generarPlanMensual(e);
      }
    });

    document.__planBound = true;
  }

  async function cargarAnalistasPlan() {
    const cont = document.querySelector(
      "#plan-analistas .multi-select-options",
    );
    const label = document.getElementById("analistas-label");
    const wrapper = document.getElementById("plan-analistas");

    if (!cont || !label || !wrapper) return;

    cont.innerHTML = "<p style='padding:8px'>Cargando...</p>";

    const res = await secureFetch("/analistas");
    const analistas = await res.json();

    cont.innerHTML = "";

    analistas.forEach((a) => {
      const div = document.createElement("div");
      div.className = "analista-option";

      div.innerHTML = `
    <input type="checkbox" value="${a._id}">
    <span>${a.username}</span>
  `;
      cont.appendChild(div);
    });

    // Toggle abrir/cerrar
    wrapper.querySelector(".multi-select-header").onclick = () => {
      wrapper.classList.toggle("open");
    };

    // Actualizar texto
    cont.addEventListener("change", () => {
      const selected = cont.querySelectorAll("input:checked").length;
      label.textContent = selected
        ? `${selected} analista(s) seleccionados`
        : "Seleccionar analistas";
    });
  }

  //GENERAR PLAN MENSUAL
  async function generarPlanMensual(e) {
    e.preventDefault();
    e.stopPropagation();

    console.log("🚀 generar PlanMensual EJECUTADA");

    const year = parseInt(document.getElementById("plan-year").value, 10);
    const month = parseInt(document.getElementById("plan-month").value, 10);

    if (!year || year < 2000 || year > 2100) {
      mostrarNotificacion("⚠️ Año inválido", "error");
      return;
    }
    if (!month || month < 1 || month > 12) {
      mostrarNotificacion("⚠️ Mes inválido", "error");
      return;
    }

    const analistasSeleccionados = Array.from(
      document.querySelectorAll(
        "#plan-analistas input[type='checkbox']:checked",
      ),
    ).map((cb) => cb.value);

    console.log("👥 Analistas seleccionados:", analistasSeleccionados);

    const form = e.target;
    const btnSubmit = form.querySelector('button[type="submit"]');
    const textoOriginal = btnSubmit.textContent;

    btnSubmit.disabled = true;
    btnSubmit.textContent = "Generando plan...";

    try {
      const res = await secureFetch(
        `/mantenimiento/plan/generar?year=${year}&month=${month}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ analistas: analistasSeleccionados }),
        },
      );

      console.log("📥 Respuesta servidor:", res.status);

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error al generar plan");
      }

      console.log("📊 Plan generado:", data);

      mostrarResumenPlan(data, month, year);
      mostrarNotificacion("Plan mensual generado correctamente", "success");

      // Refrescar tareas si aplica
      try {
        if (
          document.querySelector("#tareas.section.active") &&
          typeof cargarTareas === "function"
        ) {
          cargarTareas();
        }
      } catch {}
    } catch (err) {
      console.error("❌ Error al generar plan:", err);
      mostrarNotificacion(`❌ ${err.message}`, "error");
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = textoOriginal;
    }
  }

  function mostrarResumenPlan(data, month, year) {
    const box = document.getElementById("plan-resumen");
    if (!box) return;

    const analistas =
      (data.analistas || []).map((a) => a.username).join(", ") || "—";

    const total = data.total || {};
    const mesesNombres = [
      "Enero",
      "Febrero",
      "Marzo",
      "Abril",
      "Mayo",
      "Junio",
      "Julio",
      "Agosto",
      "Septiembre",
      "Octubre",
      "Noviembre",
      "Diciembre",
    ];

    box.style.display = "block";
    box.innerHTML = `
    <div class="resumen-plan">
      <div class="resumen-header">
        <h3>📋 Plan de Mantenimiento - ${mesesNombres[month - 1]} ${year}</h3>
        <button class="btn-cerrar" onclick="document.getElementById('plan-resumen').style.display='none'">
          <span class="material-icons">close</span>
        </button>
      </div>
      
      <div class="resumen-stats">
        <div class="stat-card">
          <div class="stat-icon">👥</div>
          <div class="stat-content">
            <div class="stat-label">Analistas Asignados</div>
            <div class="stat-value">${data.analistas?.length || 0}</div>
            <div class="stat-detail">${analistas}</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">💻</div>
          <div class="stat-content">
            <div class="stat-label">Equipos Elegibles</div>
            <div class="stat-value">${total.totalEquiposElegibles || 0}</div>
            <div class="stat-detail">Requieren mantenimiento</div>
          </div>
        </div>

        <div class="stat-card success">
          <div class="stat-icon">✅</div>
          <div class="stat-content">
            <div class="stat-label">Tareas Creadas</div>
            <div class="stat-value">${total.creadasEsteMes || 0}</div>
            <div class="stat-detail">Asignadas este mes</div>
          </div>
        </div>

        <div class="stat-card warning">
          <div class="stat-icon">⏳</div>
          <div class="stat-content">
            <div class="stat-label">Pendientes</div>
            <div class="stat-value">${total.sobrantesParaProximoMes || 0}</div>
            <div class="stat-detail">Para el próximo mes</div>
          </div>
        </div>
      </div>

      <div class="resumen-footer">
        <p><strong>Nota:</strong> Las tareas han sido distribuidas equitativamente entre los analistas de turno.</p>
        <button class="btn-primary" onclick="window.mostrarSeccion?.('tareas')">
          Ver Tareas Creadas
        </button>
      </div>
    </div>
  `;
  }

  // ==================== ESTADÍSTICAS ====================

  function actualizarEstadisticas() {
    const stats = calcularEstadisticas(equiposData);
    mostrarEstadisticas(stats);
  }

  function calcularEstadisticas(equipos) {
    const hoy = new Date();
    let vencidos = 0;
    let proximos = 0;
    let alDia = 0;

    equipos.forEach((e) => {
      if (!e.proximoMantenimiento) return;

      const diff = Math.ceil(
        (new Date(e.proximoMantenimiento) - hoy) / (1000 * 60 * 60 * 24),
      );

      if (diff < 0) vencidos++;
      else if (diff <= 30) proximos++;
      else alDia++;
    });

    return { total: equipos.length, vencidos, proximos, alDia };
  }

  function mostrarEstadisticas(stats) {
    const container = document.getElementById("stats-equipos");
    if (!container) return;

    container.innerHTML = `
    <div class="stats-grid">
      <div class="stat-box">
        <div class="stat-number">${stats.total}</div>
        <div class="stat-label">Total Equipos</div>
      </div>
      <div class="stat-box danger">
        <div class="stat-number">${stats.vencidos}</div>
        <div class="stat-label">Mantenimiento Vencido</div>
      </div>
      <div class="stat-box warning">
        <div class="stat-number">${stats.proximos}</div>
        <div class="stat-label">Próximos 30 días</div>
      </div>
      <div class="stat-box success">
        <div class="stat-number">${stats.alDia}</div>
        <div class="stat-label">Al Día</div>
      </div>
    </div>
  `;
  }

  // ==================== SISTEMA DE NOTIFICACIONES ====================

  function mostrarNotificacion(mensaje, tipo = "info") {
    const notif = document.createElement("div");
    notif.className = `notificacion notif-${tipo}`;

    const iconos = {
      success: "check_circle",
      error: "error",
      warning: "warning",
      info: "info",
    };

    notif.innerHTML = `
    <span class="material-icons">${iconos[tipo] || "info"}</span>
    <span>${mensaje}</span>
  `;

    document.body.appendChild(notif);

    setTimeout(() => notif.classList.add("show"), 10);

    setTimeout(() => {
      notif.classList.remove("show");
      setTimeout(() => notif.remove(), 300);
    }, 4000);
  }

  window.initMantenimiento = initMantenimiento;

  // ==================== UBICACIONES ====================

  function bindUbicacionesEquipo() {
    const piso = document.getElementById("eq-piso");
    const area = document.getElementById("eq-area");

    if (!piso || piso.__bound) return;

    piso.addEventListener("change", (e) => {
      cargarAreas(e.target.value);
    });

    area.addEventListener("change", (e) => {
      cargarSubareas(e.target.value);
    });

    piso.__bound = true;
  }

  //--PISOS FORMULARIO EQUIPO
  async function cargarPisos() {
    const selectPiso = document.getElementById("eq-piso");
    if (!selectPiso) return;

    selectPiso.innerHTML = '<option value="">Seleccione piso</option>';

    const res = await secureFetch("/ubicaciones/pisos");
    const pisos = await res.json();

    pisos.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p._id;
      opt.textContent = p.nombre;
      selectPiso.appendChild(opt);
    });
  }

  async function cargarAreas(pisoId) {
    const selectArea = document.getElementById("eq-area");
    const selectSub = document.getElementById("eq-subarea");

    selectArea.innerHTML = '<option value="">Seleccione área</option>';
    selectArea.disabled = true;

    selectSub.innerHTML =
      '<option value="">Seleccione subárea (opcional)</option>';
    selectSub.disabled = true;

    if (!pisoId) return;

    const res = await secureFetch(`/ubicaciones/${pisoId}/hijos`);
    const areas = await res.json();

    areas.forEach((a) => {
      const opt = document.createElement("option");
      opt.value = a._id;
      opt.textContent = a.nombre;
      selectArea.appendChild(opt);
    });

    selectArea.disabled = false;
  }

  async function cargarSubareas(areaId) {
    const selectSub = document.getElementById("eq-subarea");
    selectSub.innerHTML =
      '<option value="">Seleccione subárea (opcional)</option>';
    selectSub.disabled = true;

    if (!areaId) return;

    const res = await secureFetch(`/ubicaciones/${areaId}/hijos`);
    const subareas = await res.json();

    if (subareas.length === 0) return;

    subareas.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s._id;
      opt.textContent = s.nombre;
      selectSub.appendChild(opt);
    });

    selectSub.disabled = false;
  }

  //--PISOS FILTRO EQUIPO
  async function cargarPisosFiltros() {
    const selectPiso = document.getElementById("filtro-piso");
    if (!selectPiso) return;

    selectPiso.innerHTML = '<option value="">Seleccione piso</option>';

    const res = await secureFetch("/ubicaciones/pisos");
    const pisos = await res.json();

    pisos.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p._id;
      opt.textContent = p.nombre;
      selectPiso.appendChild(opt);
    });
  }

  async function cargarAreasFiltros(pisoId) {
    const selectArea = document.getElementById("filtro-area");
    const selectSub = document.getElementById("filtro-subarea");

    selectArea.innerHTML = '<option value="">Seleccione área</option>';
    selectArea.disabled = true;

    selectSub.innerHTML =
      '<option value="">Seleccione subárea (opcional)</option>';
    selectSub.disabled = true;

    if (!pisoId) return;

    const res = await secureFetch(`/ubicaciones/${pisoId}/hijos`);
    const areas = await res.json();

    areas.forEach((a) => {
      const opt = document.createElement("option");
      opt.value = a._id;
      opt.textContent = a.nombre;
      selectArea.appendChild(opt);
    });

    selectArea.disabled = false;
  }

  async function cargarSubareasFiltros(areaId) {
    const selectSub = document.getElementById("filtro-subarea");
    selectSub.innerHTML =
      '<option value="">Seleccione subárea (opcional)</option>';
    selectSub.disabled = true;

    if (!areaId) return;

    const res = await secureFetch(`/ubicaciones/${areaId}/hijos`);
    const subareas = await res.json();

    if (subareas.length === 0) return;

    subareas.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s._id;
      opt.textContent = s.nombre;
      selectSub.appendChild(opt);
    });

    selectSub.disabled = false;
  }

  mostrarSeccion("inicio");
  cargarEquipos();
  bindUbicacionesEquipo();
  cargarPisos();
  cargarAreas();
  cargarSubareas();
  cargarPisosFiltros();
  cargarAreasFiltros();
  cargarSubareasFiltros();
  bindFiltrosEquipos();
  calcularEstadisticas();
  initMantenimiento();
});
