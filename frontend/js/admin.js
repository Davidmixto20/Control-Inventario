document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth('ADMIN')) return;
  setupAuthButtons();

  document.getElementById('welcome-text').textContent = `Hola, ${localStorage.getItem('username')}`;
  const tableBody = document.getElementById('inventory-table-body');
  const restockSelect = document.getElementById('restock-material');
  const restockForm = document.getElementById('restock-form');
  const createForm = document.getElementById('create-material-form');
  const editForm = document.getElementById('edit-material-form');
  const editMaterialModal = new bootstrap.Modal(document.getElementById('editMaterialModal'));
  const historyDateInput = document.getElementById('history-date');
  const historyMonthInput = document.getElementById('history-month');
  const historyDayBody = document.getElementById('history-day-body');
  const historyMonthBody = document.getElementById('history-month-body');
  let currentMaterials = [];

  const todayValue = getDateInputValue(new Date());
  const monthValue = todayValue.slice(0, 7);

  historyDateInput.value = todayValue;
  historyMonthInput.value = monthValue;

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

  async function loadHistory() {
    const selectedDate = historyDateInput.value || todayValue;
    const selectedMonth = historyMonthInput.value || selectedDate.slice(0, 7);

    historyDayBody.innerHTML = `<tr><td colspan="6" class="text-center py-4">Cargando historial...</td></tr>`;
    historyMonthBody.innerHTML = `<tr><td colspan="4" class="text-center py-4">Cargando resumen...</td></tr>`;

    try {
      const params = new URLSearchParams({ date: selectedDate, month: selectedMonth });
      const response = await fetch(`${API_URL}/history?${params.toString()}`, { headers: authHeaders() });
      if (response.status === 401 || response.status === 403) return logout();

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Error al cargar historial');

      renderDailyMovements(data.dailyMovements || []);
      renderMonthlySummary(data.monthlySummary || []);
    } catch (error) {
      console.error(error);
      historyDayBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger fw-bold py-4">${error.message}</td></tr>`;
      historyMonthBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger fw-bold py-4">No se pudo cargar el resumen.</td></tr>`;
    }
  }

  function renderDailyMovements(movements) {
    historyDayBody.innerHTML = '';

    if (movements.length === 0) {
      historyDayBody.innerHTML = `<tr><td colspan="6" class="text-center py-4">No hay movimientos para este dia.</td></tr>`;
      return;
    }

    movements.forEach(movement => {
      const date = new Date(movement.timestamp);
      const typeLabel = movement.type === 'CONSUMPTION' ? 'Consumo' : 'Restock';
      const typeClass = movement.type === 'CONSUMPTION' ? 'text-danger' : 'text-success';
      const quantity = formatNumber(movement.quantity);
      const unit = movement.unit ? ` ${movement.unit}` : '';
      const batch = movement.batch_number || '-';

      const row = `
        <tr>
          <td class="fw-bold text-muted">${date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}</td>
          <td class="fw-bold">${movement.username}</td>
          <td class="fw-bold ${typeClass}">${typeLabel}</td>
          <td>${movement.material_name} <span class="text-muted small">(${movement.material_id})</span></td>
          <td class="fw-bold">${quantity}${unit}</td>
          <td class="text-muted">${batch}</td>
        </tr>
      `;
      historyDayBody.insertAdjacentHTML('beforeend', row);
    });
  }

  function renderMonthlySummary(summary) {
    historyMonthBody.innerHTML = '';

    if (summary.length === 0) {
      historyMonthBody.innerHTML = `<tr><td colspan="4" class="text-center py-4">No hay movimientos para este mes.</td></tr>`;
      return;
    }

    summary.forEach(item => {
      const typeLabel = item.type === 'CONSUMPTION' ? 'Consumido' : 'Restock';
      const typeClass = item.type === 'CONSUMPTION' ? 'text-danger' : 'text-success';
      const total = formatNumber(item.total_quantity);
      const unit = item.unit ? ` ${item.unit}` : '';

      const row = `
        <tr>
          <td class="fw-bold">${item.material_name}</td>
          <td class="fw-bold ${typeClass}">${typeLabel}</td>
          <td class="fw-bold">${total}${unit}</td>
          <td class="text-muted">${item.movements_count}</td>
        </tr>
      `;
      historyMonthBody.insertAdjacentHTML('beforeend', row);
    });
  }

  function formatNumber(value) {
    return Number(value).toLocaleString('es-VE', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  }

  function getDateInputValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
      loadHistory();
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
      loadHistory();
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
      loadHistory();
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
  });

  historyDateInput.addEventListener('change', () => {
    if (!historyMonthInput.value && historyDateInput.value) {
      historyMonthInput.value = historyDateInput.value.slice(0, 7);
    }
    loadHistory();
  });

  historyMonthInput.addEventListener('change', loadHistory);

  loadInventory();
  loadHistory();
});
