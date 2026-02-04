document.addEventListener("DOMContentLoaded", () => {
  const user = JSON.parse(sessionStorage.getItem("user") || '{}');

  // 🔥 CORRECCIÓN CLAVE
  if (user.id) {
    window.location.href = "/";
    return;
  }

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
      const res = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (res.ok) {
        const userData = {
          id: data.user.id || data.user._id,
          username: data.user.username,
          rol: data.user.rol,
          sessionToken: data.user.sessionToken,
          loginTime: Date.now()
        };

        sessionStorage.setItem("user", JSON.stringify(userData));

        window.location.href = "/";
      } else {
        loginError.textContent = data.error || "Credenciales incorrectas.";
      }
    } catch (err) {
      console.error("Error en el login:", err);
      loginError.textContent = "Error de conexión. Inténtalo más tarde.";
    }
  });
});
