document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth('ADMIN')) return;
  setupAuthButtons();

  document.getElementById('welcome-text').textContent = `Hola, ${localStorage.getItem('username')}`;
  const tableBody = document.getElementById('inventory-table-body');
  const restockSelect = document.getElementById('restock-material');
  const restockForm = document.getElementById('restock-form');
  const createForm = document.getElementById('create-material-form');
  const createUserForm = document.getElementById('create-user-form');
  const editForm = document.getElementById('edit-material-form');
  const editMaterialModal = new bootstrap.Modal(document.getElementById('editMaterialModal'));
  const historyTableBody = document.getElementById('history-table-body');
  let currentMaterials = [];

  async function loadInventory() {
    try {
      const response = await fetch(`${API_URL}/materials`, { headers: authHeaders() });
      if (response.status === 401 || response.status === 403) return logout();
      if (!response.ok) throw new Error('Error al conectar con el servidor');
      
      currentMaterials = await response.json();
      renderTable(currentMaterials);
      updateMetrics(currentMaterials);
      populateRestockSelect(currentMaterials);
    } catch (error) {
      console.error(error);
      tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger fw-bold py-4">Error cargando datos.</td></tr>`;
    }
  }

  function renderTable(materials) {
    tableBody.innerHTML = '';
    if (materials.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-4">No hay materiales registrados.</td></tr>`;
      return;
    }
    materials.forEach(mat => {
      const isCritical = parseFloat(mat.current_stock) <= parseFloat(mat.reorder_point);
      const badge = isCritical 
        ? '<span class="badge bg-danger rounded-pill px-3 py-2 shadow-sm">REORDEN</span>'
        : '<span class="badge bg-success rounded-pill px-3 py-2 shadow-sm">OK</span>';
        
      const row = `
        <tr>
          <td data-label="ID" class="fw-bold text-muted">${mat.id}</td>
          <td data-label="Material" class="fw-bold text-dark">${mat.name}</td>
          <td data-label="Stock Actual" class="fs-5 fw-bold">${mat.current_stock}</td>
          <td data-label="Punto Reorden" class="text-muted">${mat.reorder_point}</td>
          <td data-label="Unidad" class="text-muted">${mat.unit}</td>
          <td data-label="Estado">${badge}</td>
          <td data-label="Acciones">
            <div class="d-flex flex-wrap gap-2">
              <button class="btn btn-sm btn-outline-dark fw-bold" onclick="openEditMaterial('${mat.id}')">Editar</button>
              <button class="btn btn-sm btn-outline-danger fw-bold" onclick="deleteMaterial('${mat.id}')">Eliminar</button>
            </div>
          </td>
        </tr>
      `;
      tableBody.insertAdjacentHTML('beforeend', row);
    });
  }

  function updateMetrics(materials) {
    document.getElementById('metric-total').textContent = materials.length;
    document.getElementById('metric-alerts').textContent = materials.filter(mat => parseFloat(mat.current_stock) <= parseFloat(mat.reorder_point)).length;
  }

  function populateRestockSelect(materials) {
    restockSelect.innerHTML = '<option value="">Selecciona un material...</option>';
    materials.forEach(mat => {
      restockSelect.insertAdjacentHTML('beforeend', `<option value="${mat.id}">${mat.name} (${mat.id})</option>`);
    });
  }

  window.openEditMaterial = function(id) {
    const material = currentMaterials.find(mat => mat.id === id);
    if (!material) return alert('Material no encontrado en la lista actual.');

    document.getElementById('edit-mat-id').value = material.id;
    document.getElementById('edit-mat-name').value = material.name;
    document.getElementById('edit-mat-unit').value = material.unit;
    document.getElementById('edit-mat-reorder').value = material.reorder_point;
    editMaterialModal.show();
  };

  window.deleteMaterial = async function(id) {
    if (!confirm('¿Estás seguro que deseas eliminar este material? Esto no se puede deshacer.')) return;
    try {
      const res = await fetch(`${API_URL}/materials/${id}`, { method: 'DELETE', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      loadInventory();
    } catch (e) {
      alert(e.message);
    }
  };

  window.deleteBatch = async function(batchNumber) {
    if (!confirm('¿Estás seguro que deseas eliminar este lote de producción? Esto devolverá los materiales descontados al inventario y NO se puede deshacer.')) return;
    try {
      const res = await fetch(`${API_URL}/batches/${batchNumber}`, { method: 'DELETE', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert('Lote eliminado correctamente. El inventario ha sido actualizado.');
      loadInventory();
      loadProductionHistory();
    } catch (e) {
      alert(e.message);
    }
  };

  createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('new-mat-name').value;
    const unit = document.getElementById('new-mat-unit').value;
    const reorder_point = parseFloat(document.getElementById('new-mat-reorder').value);

    try {
      const res = await fetch(`${API_URL}/materials`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name, unit, reorder_point })
      });
      if (!res.ok) throw new Error('Error al crear material');
      createForm.reset();
      bootstrap.Modal.getInstance(document.getElementById('createMaterialModal')).hide();
      loadInventory();
    } catch (error) {
      alert(error.message);
    }
  });

  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-mat-id').value;
    const name = document.getElementById('edit-mat-name').value.trim();
    const unit = document.getElementById('edit-mat-unit').value.trim();
    const reorder_point = parseFloat(document.getElementById('edit-mat-reorder').value);

    try {
      const res = await fetch(`${API_URL}/materials/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ name, unit, reorder_point })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al editar material');

      editForm.reset();
      editMaterialModal.hide();
      loadInventory();
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
  });

  restockForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const material_id = restockSelect.value;
    const quantity = parseFloat(document.getElementById('restock-quantity').value);

    try {
      const res = await fetch(`${API_URL}/restock`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ material_id, quantity })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert('Restock guardado exitosamente.');
      restockForm.reset();
      bootstrap.Modal.getInstance(document.getElementById('restockModal')).hide();
      loadInventory();
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
  });

  if (createUserForm) {
    createUserForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('new-username').value.trim();
      const password = document.getElementById('new-user-password').value;
      const role = document.getElementById('new-user-role').value;
      const btn = createUserForm.querySelector('button[type="submit"]');

      btn.disabled = true;
      btn.textContent = 'Guardando...';

      try {
        const response = await fetch(`${API_URL}/users`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ username, password, role })
        });
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error || 'Error al crear usuario');

        alert('Usuario creado exitosamente.');
        createUserForm.reset();
        bootstrap.Modal.getInstance(document.getElementById('createUserModal')).hide();
      } catch (error) {
        alert(error.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Guardar Usuario';
      }
    });
  }

  async function loadProductionHistory() {
    if (!historyTableBody) return;
    try {
      const response = await fetch(`${API_URL}/production-history`, { headers: authHeaders() });
      if (!response.ok) return;
      const history = await response.json();
      historyTableBody.innerHTML = '';
      if (history.length === 0) {
        historyTableBody.innerHTML = `<tr><td colspan="4" class="text-center py-4">No hay producción registrada aún.</td></tr>`;
        return;
      }
      history.forEach(item => {
        const dateStr = new Date(item.date).toLocaleString('es-ES', { 
          day: '2-digit', month: '2-digit', year: 'numeric', 
          hour: '2-digit', minute:'2-digit' 
        });
        const row = `
          <tr>
            <td class="text-muted fw-bold">${dateStr}</td>
            <td class="fw-bold text-dark">${item.batch_number}</td>
            <td class="fw-bold text-success fs-5">${item.total_yield}</td>
            <td>
              <button class="btn btn-sm btn-outline-danger fw-bold" onclick="deleteBatch('${item.batch_number}')">Eliminar</button>
            </td>
          </tr>
        `;
        historyTableBody.insertAdjacentHTML('beforeend', row);
      });
    } catch (error) {
      console.error(error);
      historyTableBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger fw-bold py-4">Error cargando historial de producción.</td></tr>`;
    }
  }

  loadInventory();
  loadProductionHistory();
});
