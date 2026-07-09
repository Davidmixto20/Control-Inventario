document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth('WORKER')) return;
  setupAuthButtons();

  // ==========================================
  // CONFIGURACIÓN DE RECETA PREDETERMINADA
  // ==========================================
  const DEFAULT_RECIPE = [
    { name: "Harina de trigo", defaultQuantity: 3000, options: [2900, 3000] },
    { name: "Harina de maiz", defaultQuantity: 715, options: [640, 715] },
    { name: "Azucar blanca", defaultQuantity: 750, options: [715, 750] },
    { name: "Azucar glasc", defaultQuantity: 715, options: [640, 715] },
    { name: "Margarina", defaultQuantity: 1000, options: [900, 1000] },
    { name: "Huevos", defaultQuantity: 600, options: [500, 600] },
    { name: "Cocoa", defaultQuantity: 105, options: [105] },
    { name: "Aceite", defaultQuantity: 80, options: [80] },
    { name: "Saborizante", defaultQuantity: 15, options: [10, 15] }
  ];
  // ==========================================

  document.getElementById('welcome-text').textContent = `Hola, ${localStorage.getItem('username')}`;
  const materialsContainer = document.getElementById('materials-container');
  const inventoryTable = document.getElementById('worker-inventory-table');
  const addMaterialBtn = document.getElementById('add-material-btn');
  const consumptionForm = document.getElementById('consumption-form');
  const submitBtn = document.getElementById('submit-btn');

  let availableMaterials = [];

  async function loadMaterials() {
    try {
      const response = await fetch(`${API_URL}/materials`, { headers: authHeaders() });
      if (response.status === 401 || response.status === 403) return logout();
      if (response.ok) {
        availableMaterials = await response.json();
        renderInventoryTable();
        if (materialsContainer.children.length === 0) {
          loadDefaultRecipe();
        }
      } else {
        alert('Error cargando materiales del servidor.');
      }
    } catch (error) {
      console.error(error);
      alert('Error de conexión con el backend.');
    }
  }

  function renderInventoryTable() {
    inventoryTable.innerHTML = '';
    if(availableMaterials.length === 0) {
        inventoryTable.innerHTML = `<tr><td colspan="3" class="text-center py-3">No hay materiales registrados.</td></tr>`;
        return;
    }

    availableMaterials.forEach(mat => {
      const isCritical = parseFloat(mat.current_stock) <= parseFloat(mat.reorder_point);
      const textClass = isCritical ? 'text-danger fw-bold' : 'text-success fw-bold';
      const statusText = isCritical ? 'Bajo' : 'OK';

      const row = `
        <tr>
          <td class="fw-bold">${mat.name} <span class="text-muted small">(${mat.id})</span></td>
          <td class="fw-bold fs-6">${mat.current_stock} ${mat.unit}</td>
          <td class="${textClass}">${statusText}</td>
        </tr>
      `;
      inventoryTable.insertAdjacentHTML('beforeend', row);
    });
  }

  function loadDefaultRecipe() {
    DEFAULT_RECIPE.forEach(recipeItem => {
      const mat = availableMaterials.find(m => {
        // Ignorar acentos para la busqueda
        const dbName = m.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const recipeName = recipeItem.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        return dbName.includes(recipeName);
      });
      if (mat) {
        addMaterialRow(mat.id, recipeItem.defaultQuantity, recipeItem.options);
      }
    });
    // Añadir una vacía al final
    addMaterialRow();
  }

  window.setQuickQuantity = function(rowId, qty) {
    document.getElementById('qty-' + rowId).value = qty;
  };

  function addMaterialRow(preselectedId = null, defaultQty = '', quickOptions = []) {
    const rowId = Date.now() + Math.random().toString().slice(2, 6);
    let options = '<option value="">Seleccionar material...</option>';
    availableMaterials.forEach(mat => {
      const isSelected = mat.id === preselectedId ? 'selected' : '';
      options += `<option value="${mat.id}" ${isSelected}>${mat.name} (${mat.unit}) - Disp: ${mat.current_stock}</option>`;
    });

    let quickOptionsHtml = '';
    if (quickOptions.length > 0) {
      quickOptionsHtml = '<div class="mt-2">';
      quickOptions.forEach(opt => {
        quickOptionsHtml += `<span class="badge bg-primary me-2 py-2 px-3 shadow-sm" style="cursor:pointer;" onclick="setQuickQuantity('${rowId}', ${opt})">${opt}g</span>`;
      });
      quickOptionsHtml += '</div>';
    }

    const rowHtml = `
      <div class="row mb-3 material-row align-items-center" id="row-${rowId}">
        <div class="col-md-5 col-12 mb-2 mb-md-0">
          <label class="form-label text-muted small mb-1 fw-bold">Material</label>
          <select class="form-select material-select" required>
            ${options}
          </select>
        </div>
        <div class="col-md-5 col-8 mb-2 mb-md-0">
          <label class="form-label text-muted small mb-1 fw-bold">Cantidad Utilizada</label>
          <input type="number" class="form-control material-quantity" id="qty-${rowId}" step="0.01" min="0.01" value="${defaultQty}" required>
          ${quickOptionsHtml}
        </div>
        <div class="col-md-2 col-4 mb-2 mb-md-0 mt-3 mt-md-0 text-end">
          <button type="button" class="btn btn-outline-danger fw-bold w-100 h-100" onclick="document.getElementById('row-${rowId}').remove()">X</button>
        </div>
      </div>
    `;
    materialsContainer.insertAdjacentHTML('beforeend', rowHtml);
  }

  addMaterialBtn.addEventListener('click', () => addMaterialRow());

  consumptionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const batchNumber = document.getElementById('batch-number').value.trim();
    const totalYield = parseFloat(document.getElementById('total-yield').value);
    
    const itemRows = document.querySelectorAll('.material-row');
    const items = [];
    let hasError = false;

    itemRows.forEach(row => {
      const select = row.querySelector('.material-select');
      const quantityInput = row.querySelector('.material-quantity');
      const material_id = select.value;
      const quantity = parseFloat(quantityInput.value);

      if (!material_id || isNaN(quantity) || quantity <= 0) hasError = true;
      items.push({ material_id, quantity });
    });

    if (hasError || items.length === 0) {
      return alert('Por favor completa todos los materiales con cantidades válidas.');
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Procesando...';

    try {
      const response = await fetch(`${API_URL}/consumption`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ batch_number: batchNumber, total_yield: totalYield, items })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Error al registrar consumo');

      alert('Consumo registrado exitosamente.');
      consumptionForm.reset();
      materialsContainer.innerHTML = '';
      
      await loadMaterials();
    } catch (error) {
      alert(`Error: ${error.message}`);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Registrar Consumo y Actualizar Inventario';
    }
  });

  loadMaterials();
});
