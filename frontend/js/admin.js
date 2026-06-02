document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth('ADMIN')) return;
  setupAuthButtons();

  document.getElementById('welcome-text').textContent = `Hola, ${localStorage.getItem('username')}`;
  const tableBody = document.getElementById('inventory-table-body');
  const restockSelect = document.getElementById('restock-material');
  const restockForm = document.getElementById('restock-form');
  const createForm = document.getElementById('create-material-form');

  async function loadInventory() {
    try {
      const response = await fetch(`${API_URL}/materials`, { headers: authHeaders() });
      if (response.status === 401 || response.status === 403) return logout();
      if (!response.ok) throw new Error('Error al conectar con el servidor');
      
      const materials = await response.json();
      renderTable(materials);
      updateMetrics(materials);
      populateRestockSelect(materials);
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
          <td class="fw-bold text-muted">${mat.id}</td>
          <td class="fw-bold text-dark">${mat.name}</td>
          <td class="fs-5 fw-bold">${mat.current_stock}</td>
          <td class="text-muted">${mat.reorder_point}</td>
          <td class="text-muted">${mat.unit}</td>
          <td>${badge}</td>
          <td>
            <button class="btn btn-sm btn-outline-danger fw-bold" onclick="deleteMaterial('${mat.id}')">Eliminar</button>
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

  loadInventory();
});
