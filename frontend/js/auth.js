const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'http://localhost:3000/api' 
  : 'https://control-inventario-e8f5.onrender.com/api'; // <-- REEMPLAZAR con la URL de tu backend en Render

function checkAuth(requiredRole = null) {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

  if (!token) {
    window.location.href = 'login.html';
    return null;
  }

  if (requiredRole && role !== requiredRole) {
    alert('Acceso denegado: No tienes permiso para ver esta página.');
    window.location.href = role === 'ADMIN' ? 'index.html' : 'worker.html';
    return null;
  }

  return { token, role };
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('role');
  localStorage.removeItem('username');
  window.location.href = 'login.html';
}

function setupAuthButtons() {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  }

  const passForm = document.getElementById('password-form');
  if (passForm) {
    passForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPassword = document.getElementById('new-password').value;
      const btn = passForm.querySelector('button[type="submit"]');
      
      btn.disabled = true;
      btn.textContent = 'Actualizando...';

      try {
        const res = await fetch(`${API_URL}/users/password`, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify({ newPassword })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        
        alert('Contraseña actualizada exitosamente. Por favor, inicia sesión de nuevo.');
        
        // Cerrar el modal si está abierto
        const modalElement = document.getElementById('passwordModal');
        if (modalElement) {
            const modal = bootstrap.Modal.getInstance(modalElement);
            if(modal) modal.hide();
        }
        
        logout();
      } catch (err) {
        alert(err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Actualizar Contraseña';
      }
    });
  }
}

function authHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}
