document.addEventListener("DOMContentLoaded", function () {
    console.log("Script cargado correctamente");

    // Función para cambiar entre secciones
    window.mostrarSeccion = function (id) {
        document.querySelectorAll(".section").forEach(seccion => {
            seccion.classList.add("hidden"); // Oculta todas las secciones
        });
        document.getElementById(id).classList.remove("hidden"); // Muestra la sección deseada
    };

    // Función para cerrar sesión
    window.cerrarSesion = function () {
        localStorage.removeItem("user");
        window.location.href = "login.html";
    };

    // Función para cargar analistas
    async function cargarAnalistas() {
        try {
            const response = await fetch("/analistas");
            const analistas = await response.json();
            const selectAnalista = document.getElementById("analista");
            selectAnalista.innerHTML = "<option value=''>Seleccione un analista</option>"; // Resetear opciones

            // Llenar el select con los analistas
            analistas.forEach(analista => {
                const option = document.createElement("option");
                option.value = analista.username;
                option.textContent = analista.username;
                selectAnalista.appendChild(option);
            });
        } catch (error) {
            console.error("Error al cargar analistas:", error);
        }
    }

    // Llamar a la función cuando se cargue la página
    document.addEventListener("DOMContentLoaded", function () {
        cargarAnalistas();
    });
    // Manejo de formulario para crear tareas
const formTarea = document.getElementById("formTarea");
if (formTarea) {
    formTarea.addEventListener("submit", async function (e) {
        e.preventDefault();

        // Capturar valores del formulario
        const titulo = document.getElementById("titulo").value.trim();
        const descripcion = document.getElementById("descripcion").value.trim();
        const fechaHora = document.getElementById("fechaHora").value;
        const analista = document.getElementById("analista").value; // Valor del select
        const fechaLimite = document.getElementById("fechaLimite").value;
        const ticket = document.getElementById("ticket").value.trim();
        const placa = document.getElementById("placa").value.trim();
        const observacion = document.getElementById("observacion").value.trim();

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

            if (response.ok) {
                alert("Tarea guardada correctamente.");
                formTarea.reset();
                mostrarSeccion('tareas');
                cargarTareas(); // Recargar lista de tareas
            } else {
                alert("Error al guardar la tarea.");
            }
        } catch (error) {
            alert("Error de conexión con el servidor.");
        }
    });
}

    // Funcion para terminar y reasignar

    function mostrarTareasEnDOM(tareas) {
        const listaTareas = document.getElementById("listaTareas");
        listaTareas.innerHTML = "";
        tareas.forEach(tarea => {
            const tareaElement = document.createElement("tr");
            tareaElement.innerHTML = `
                <td>${tarea.titulo}</td>
                <td>${tarea.analista}</td>
                <td>${tarea.fecha_hora}</td>
                <td>${tarea.estado}</td>
                <td>
                    <button onclick="terminarTarea(${tarea.id})">Terminar</button>
                    <button onclick="reasignarTarea(${tarea.id})">Reasignar</button>
                </td>
            `;
            listaTareas.appendChild(tareaElement);
        });
    }
    
    async function terminarTarea(id) {
        try {
            const response = await fetch(`/tareas/terminar/${id}`, { method: "PUT" });
            if (response.ok) {
                alert("Tarea terminada correctamente");
                cargarTareas();
            } else {
                alert("Error al terminar la tarea");
            }
        } catch (error) {
            console.error("Error:", error);
        }
    }
    
    async function reasignarTarea(id) {
        const analista_nuevo = prompt("Ingrese el nombre del nuevo analista:");
        if (analista_nuevo) {
            try {
                const response = await fetch(`/tareas/reasignar/${id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ analista_nuevo })
                });
                if (response.ok) {
                    alert("Tarea reasignada correctamente");
                    cargarTareas();
                } else {
                    alert("Error al reasignar la tarea");
                }
            } catch (error) {
                console.error("Error:", error);
            }
        }
    }

    // Cargar tareas al iniciar
    async function cargarTareas() {
        try {
            const response = await fetch("http://localhost:3000/tareas");
            const tareas = await response.json();
            const listaTareas = document.getElementById("listaTareas");
            listaTareas.innerHTML = ""; // Limpiar tabla antes de actualizar

            tareas.forEach(tarea => {
                const fila = document.createElement("tr");
                fila.innerHTML = `
                    <td>${tarea.titulo}</td>
                    <td>${tarea.analista}</td>
                    <td>${new Date(tarea.fechaHora).toLocaleString()}</td>
                    <td>${tarea.estado || "Pendiente"}</td>
                    <td>
                        <button onclick="eliminarTarea(${tarea.id})">🗑️ Eliminar</button>
                    </td>
                `;
                listaTareas.appendChild(fila);
            });
        } catch (error) {
            console.error("Error al cargar tareas:", error);
        }
    }

    window.eliminarTarea = async function (id) {
        if (confirm("¿Seguro que quieres eliminar esta tarea?")) {
            try {
                const response = await fetch(`http://localhost:3000/tareas/${id}`, {
                    method: "DELETE"
                });

                if (response.ok) {
                    alert("Tarea eliminada.");
                    cargarTareas();
                } else {
                    alert("Error al eliminar la tarea.");
                }
            } catch (error) {
                alert("Error de conexión con el servidor.");
            }
        }
    };

    cargarTareas();
});
