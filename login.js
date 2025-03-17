document.addEventListener("DOMContentLoaded", function () {
    const loginForm = document.getElementById("loginForm");

    loginForm.addEventListener("submit", function (event) {
        event.preventDefault();

        const username = document.getElementById("username").value;
        const password = document.getElementById("password").value;

        fetch("http://localhost:3000/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                localStorage.setItem("user", JSON.stringify({ id: data.user.id, username: data.user.username }));
                window.location.href = "index.html";
            } else {
                document.getElementById("loginError").textContent = data.error;
            }
        })
        .catch(error => console.error("Error en el login:", error));
    });
});
