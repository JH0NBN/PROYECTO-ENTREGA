document.addEventListener("DOMContentLoaded", () => {
    // Validación de sesión: si ya está logueado, redirige al dashboard
    const user = JSON.parse(localStorage.getItem("user") || '{}');
    if (user.id) window.location.href = 'index.html';
  
    const loginForm  = document.getElementById("loginForm");
    const loginError = document.getElementById("loginError");
  
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = document.getElementById("username").value.trim();
      const password = document.getElementById("password").value.trim();
  
      if (!username || !password) {
        loginError.textContent = "Todos los campos son obligatorios.";
        return;
      }
  
      try {
        const res  = await fetch("/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
  
        if (res.ok) {
          localStorage.setItem("user", JSON.stringify(data.user));
          window.location.href = "index.html";
        } else {
          loginError.textContent = data.error || "Credenciales incorrectas.";
        }
      } catch (err) {
        console.error("Error en el login:", err);
        loginError.textContent = "Error de conexión. Inténtalo más tarde.";
      }
    });
  });
  