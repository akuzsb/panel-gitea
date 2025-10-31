'use strict';

const daysSelector = document.getElementById('days');
const refreshButton = document.getElementById('refresh');
const exportButton = document.getElementById('export');
const allBranchesToggle = document.getElementById('all-branches');
const statusBox = document.getElementById('status');
const tableBody = document.querySelector('#repos-table tbody');

async function fetchRepoStats(days, allBranches) {
  const response = await fetch(`/api/repos?days=${days}&allBranches=${allBranches}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Error desconocido' }));
    throw new Error(error.message || 'Error al obtener las estadisticas de repositorios');
  }
  return response.json();
}

function formatDate(isoString) {
  if (!isoString) {
    return '—';
  }
  const date = new Date(isoString);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat('es-ES').format(value);
}

function renderRepos(data) {
  tableBody.innerHTML = '';

  if (!Array.isArray(data.repos) || data.repos.length === 0) {
    statusBox.textContent = 'Sin actividad en el periodo seleccionado.';
    statusBox.classList.remove('error');
    return;
  }

  for (const repo of data.repos) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${repo.fullName}</td>
      <td>${formatNumber(repo.commits)}</td>
      <td>${formatNumber(repo.linesChanged)}</td>
      <td>${formatNumber(repo.contributors)}</td>
      <td>${formatDate(repo.lastActivity)}</td>
    `;
    tableBody.appendChild(row);
  }

  const scope = data.allBranches ? 'todas las ramas' : 'rama por defecto';
  statusBox.textContent = `Datos generados el ${formatDate(data.generatedAt)} para los últimos ${data.days} días (${scope}).`;
  statusBox.classList.remove('error');
}

async function updateRepos() {
  const days = Number(daysSelector.value);
  statusBox.textContent = 'Cargando...';
  statusBox.classList.remove('error');
  tableBody.innerHTML = '';

  try {
    const includeAllBranches = allBranchesToggle.checked;
    const data = await fetchRepoStats(days, includeAllBranches);
    renderRepos(data);
  } catch (error) {
    console.error(error);
    statusBox.textContent = error.message || 'Error cargando datos';
    statusBox.classList.add('error');
  }
}

refreshButton.addEventListener('click', updateRepos);

exportButton.addEventListener('click', () => {
  const days = Number(daysSelector.value);
  const includeAllBranches = allBranchesToggle.checked;
  window.location.href = `/api/stats/export?days=${days}&allBranches=${includeAllBranches}`;
});

document.addEventListener('DOMContentLoaded', updateRepos);
