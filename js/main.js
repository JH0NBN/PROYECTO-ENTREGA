document.addEventListener("DOMContentLoaded", function () {
    console.log("🔄 Documento cargado. Iniciando eventos...");

    // Función para manejar el botón "Volver"
    window.manejarBotonVolver = function () {
        const seccionActual = document.querySelector(".section.active").id;

        if (seccionActual === "tareas" || seccionActual === "crear-tarea") {
            mostrarSeccion("inicio");
        } else if (seccionActual === "reasignar-tarea" || seccionActual === "detalles-tarea") {
            mostrarSeccion("tareas");
        }
    };

    // Evento para el formulario de login
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
        loginForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            console.log("📌 Enviando datos de login...");

            const username = document.getElementById("username").value;
            const password = document.getElementById("password").value;

            if (!username || !password) {
                alert("❌ Todos los campos son obligatorios");
                return;
            }

            try {
                const response = await fetch("http://localhost:3000/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username, password }),
                });

                if (!response.ok) {
                    throw new Error("Error en la respuesta del servidor");
                }

                const data = await response.json();
                console.log("📌 Respuesta del servidor:", data);

                if (data.message === "Inicio de sesión exitoso") {
                    localStorage.setItem("user", JSON.stringify(data.user));
                    window.location.href = "index.html";
                } else {
                    alert("❌ " + data.error);
                }
            } catch (error) {
                console.error("❌ Error en login:", error);
                alert("❌ Error al iniciar sesión");
            }
        });
    }

    // Evento para cerrar sesión
    const btnCerrarSesion = document.getElementById("btnCerrarSesion");
    if (btnCerrarSesion) {
        btnCerrarSesion.addEventListener("click", function () {
            console.log("📌 Cerrando sesión...");
            localStorage.removeItem("user");
            window.location.href = "login.html";
        });
    }

    // Evento para cambiar de sección
    document.querySelectorAll(".nav-links a").forEach(link => {
        link.addEventListener("click", function (event) {
            event.preventDefault();
            const section = this.getAttribute("data-section");
            mostrarSeccion(section);
        });
    });

    // Función para mostrar secciones
    function mostrarSeccion(id) {
        console.log(`🔄 Cambiando a la sección: ${id}`);
        document.querySelectorAll(".section").forEach(seccion => {
            seccion.classList.remove("active");
            seccion.classList.add("hidden");
        });
        const seccionMostrar = document.getElementById(id);
        if (seccionMostrar) {
            seccionMostrar.classList.add("active");
            seccionMostrar.classList.remove("hidden");
        } else {
            console.error(`❌ No se encontró la sección con ID: ${id}`);
        }
    }

    // Función para cargar analistas
    async function cargarAnalistas() {
        console.log("Cargando analistas...");
        const selectAnalista = document.getElementById("analista");
        const selectReasignarAnalista = document.getElementById("reasignar-analista");
        if (!selectAnalista || !selectReasignarAnalista) {
            console.error("❌ No se encontraron los elementos de selección de analistas");
            return;
        }

        try {
            const response = await fetch("http://localhost:3000/analistas");
            console.log("Respuesta de /analistas:", response);
            if (!response.ok) {
                throw new Error("Error al obtener analistas");
            }
            const analistas = await response.json();
            console.log("Analistas recibidos:", analistas);
            selectAnalista.innerHTML = "<option value=''>Seleccione un analista</option>";
            selectReasignarAnalista.innerHTML = "<option value=''>Seleccione un analista</option>";

            analistas.forEach(analista => {
                const option = document.createElement("option");
                option.value = analista.username;
                option.textContent = analista.username;
                selectAnalista.appendChild(option.cloneNode(true));
                selectReasignarAnalista.appendChild(option);
            });
        } catch (error) {
            console.error("Error al cargar analistas:", error);
            alert("No se pudieron cargar los analistas. Inténtalo de nuevo más tarde.");
        }
    }

    // Función para cargar tareas
    async function cargarTareas() {
        console.log("Cargando tareas...");
        const listaTareas = document.getElementById("listaTareas");
        if (!listaTareas) {
            console.error("❌ No se encontró el elemento con ID 'listaTareas'");
            return;
        }

        try {
            const response = await fetch("http://localhost:3000/tareas");
            console.log("Respuesta de /tareas:", response);
            if (!response.ok) {
                throw new Error("Error al obtener tareas");
            }
            const tareas = await response.json();
            console.log("Tareas recibidas:", tareas);
            listaTareas.innerHTML = "";

            tareas.forEach(tarea => {
                const fila = document.createElement("tr");
                fila.innerHTML = `
                    <td>${tarea.titulo}</td>
                    <td>${tarea.analista}</td>
                    <td>${new Date(tarea.fecha_hora).toLocaleString()}</td>
                    <td>${tarea.estado || "Pendiente"}</td>
                    <td>
                        ${tarea.estado === 'Pendiente' ? `<button onclick="terminarTarea(${tarea.id})">Terminar</button>` : ''}
                        ${tarea.estado === 'Pendiente' ? `<button onclick="abrirFormularioReasignar(${tarea.id})">Reasignar</button>` : ''}
                        <button onclick="verDetallesTarea(${tarea.id})">Ver Detalles</button>
                    </td>
                `;
                listaTareas.appendChild(fila);
            });
        } catch (error) {
            console.error("Error al obtener tareas:", error);
        }
    }

    // Función para ver detalles de una tarea
    window.verDetallesTarea = async function (id) {
        try {
            // Obtener detalles de la tarea
            const responseTarea = await fetch(`http://localhost:3000/tareas/${id}`);
            if (!responseTarea.ok) {
                throw new Error("Error al obtener detalles de la tarea");
            }
            const tarea = await responseTarea.json();
            console.log("Detalles de la tarea recibidos:", tarea);

            // Llenar el formulario de detalles
            document.getElementById("detalles-titulo").value = tarea.titulo;
            document.getElementById("detalles-descripcion").value = tarea.descripcion;
            document.getElementById("detalles-fechaHora").value = new Date(tarea.fecha_hora).toLocaleString();
            document.getElementById("detalles-analista").value = tarea.analista;
            document.getElementById("detalles-fechaLimite").value = tarea.fecha_limite;
            document.getElementById("detalles-ticket").value = tarea.ticket;
            document.getElementById("detalles-placa").value = tarea.placa;
            document.getElementById("detalles-observacion").value = tarea.observacion || "N/A";
            document.getElementById("detalles-estado").value = tarea.estado || "Pendiente";

            // Obtener el historial de cambios de la tarea
            const responseHistorial = await fetch(`http://localhost:3000/historial-tareas/${id}`);
            if (!responseHistorial.ok) {
                throw new Error("Error al obtener el historial de la tarea");
            }
            const historial = await responseHistorial.json();
            console.log("Historial de cambios recibido:", historial);

            // Mostrar el historial en la sección correspondiente
            const listaHistorial = document.getElementById("listaHistorial");
            listaHistorial.innerHTML = ""; // Limpiar el contenido anterior

            historial.forEach(cambio => {
                const fila = document.createElement("tr");
                fila.innerHTML = `
                    <td>${cambio.accion}</td>
                    <td>${cambio.analista_anterior || "N/A"}</td>
                    <td>${cambio.analista_nuevo || "N/A"}</td>
                    <td>${cambio.observacion || "N/A"}</td> <!-- Mostrar observación -->
                    <td>${new Date(cambio.fecha).toLocaleString()}</td>
                `;
                listaHistorial.appendChild(fila);
            });

            // Mostrar la sección de detalles
            mostrarSeccion('detalles-tarea');
        } catch (error) {
            console.error("Error al obtener detalles de la tarea:", error);
            alert("❌ Error al cargar los detalles de la tarea");
        }
    };

    // Función para terminar una tarea
    window.terminarTarea = async function (id) {
        if (confirm("¿Seguro que quieres terminar esta tarea?")) {
            try {
                const response = await fetch(`http://localhost:3000/tareas/terminar/${id}`, {
                    method: "PUT"
                });

                if (!response.ok) {
                    throw new Error("Error al terminar la tarea");
                }

                const data = await response.json();
                alert(data.message);
                cargarTareas(); // Recargar lista de tareas
            } catch (error) {
                console.error("Error:", error);
                alert("❌ Error al terminar la tarea");
            }
        }
    };

    // Función para reasignar una tarea
    window.abrirFormularioReasignar = function (id) {
        // Ocultar todas las secciones
        document.querySelectorAll(".section").forEach(seccion => {
            seccion.classList.remove("active");
            seccion.classList.add("hidden");
        });

        // Mostrar la sección de reasignación
        const seccionReasignar = document.getElementById("reasignar-tarea");
        seccionReasignar.classList.remove("hidden");
        seccionReasignar.classList.add("active");

        // Configurar el formulario de reasignación
        const formReasignar = document.getElementById("formReasignar");
        formReasignar.onsubmit = async function (e) {
            e.preventDefault();

            const analista = document.getElementById("reasignar-analista").value;
            const fechaLimite = document.getElementById("reasignar-fechaLimite").value;
            const observacion = document.getElementById("reasignar-observacion").value.trim(); // Capturar observación

            if (!analista || !fechaLimite) {
                alert("Por favor, complete todos los campos.");
                return;
            }

            try {
                const response = await fetch(`http://localhost:3000/tareas/reasignar/${id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ analista, fechaLimite, observacion }) // Incluir observación
                });

                if (!response.ok) {
                    throw new Error("Error al reasignar la tarea");
                }

                const data = await response.json();
                alert(data.message);
                mostrarSeccion('tareas'); // Volver a la lista de tareas
                cargarTareas(); // Recargar lista de tareas
            } catch (error) {
                console.error("Error:", error);
                alert("❌ Error al reasignar la tarea");
            }
        };
    };

    // Manejo del formulario de creación de tareas
    const formTarea = document.getElementById("formTarea");
    if (formTarea) {
        formTarea.addEventListener("submit", async function (e) {
            e.preventDefault();

            // Capturar valores del formulario
            const titulo = document.getElementById("titulo").value.trim();
            const descripcion = document.getElementById("descripcion").value.trim();
            const fechaHora = document.getElementById("fechaHora").value;
            const analista = document.getElementById("analista").value;
            const fechaLimite = document.getElementById("fechaLimite").value;
            const ticket = document.getElementById("ticket").value.trim();
            const placa = document.getElementById("placa").value.trim();
            const observacion = document.getElementById("observacion").value.trim();

            // Validar campos obligatorios
            if (!titulo || !descripcion || !fechaHora || !analista || !fechaLimite || !ticket || !placa) {
                alert("Por favor, complete todos los campos obligatorios.");
                return;
            }

            try {
                const response = await fetch("http://localhost:3000/tareas", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        titulo,
                        descripcion,
                        fechaHora,
                        analista,
                        fechaLimite,
                        ticket,
                        placa,
                        observacion
                    })
                });

                if (!response.ok) {
                    throw new Error("Error al guardar la tarea");
                }

                const data = await response.json();
                alert("Tarea guardada correctamente.");
                formTarea.reset(); // Limpiar el formulario
                mostrarSeccion('tareas'); // Redirigir a la lista de tareas
                cargarTareas(); // Recargar la lista de tareas
            } catch (error) {
                console.error("Error al guardar la tarea:", error);
                alert("Error al guardar la tarea. Inténtalo de nuevo.");
            }
        });
    }

    // Llamar a las funciones de carga al inicio
    cargarAnalistas();
    cargarTareas();
});