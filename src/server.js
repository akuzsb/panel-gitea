const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const ExcelJS = require('exceljs');

dotenv.config();

const { fetchActivityStats, fetchRepoStats } = require('./services/statsService');
const { validateDaysParam } = require('./utils/validation');

const app = express();
const PORT = process.env.PORT || 4040;

function normalizeBasePath(value) {
  if (!value) {
    return '/';
  }
  let base = value.trim();
  if (!base.startsWith('/')) {
    base = `/${base}`;
  }
  base = base.replace(/\/+$/, '');
  if (base === '') {
    return '/';
  }
  return base;
}

const BASE_PATH = normalizeBasePath(process.env.BASE_PATH || '/');
const router = express.Router();

router.get('/api/stats', async (req, res) => {
  const { error, value: days } = validateDaysParam(req.query.days);
  if (error) {
    res.status(400).json({ message: error });
    return;
  }

  try {
    const includeAllBranches = String(req.query.allBranches).toLowerCase() === 'true';
    const { users, repos } = await fetchActivityStats(days, includeAllBranches);
    res.json({ generatedAt: new Date().toISOString(), days, allBranches: includeAllBranches, users, repos });
  } catch (err) {
    console.error('Failed to collect stats', err);
    res.status(502).json({ message: 'No se pudieron obtener las estadisticas desde Gitea.' });
  }
});

router.get('/api/repos', async (req, res) => {
  const { error, value: days } = validateDaysParam(req.query.days);
  if (error) {
    res.status(400).json({ message: error });
    return;
  }

  try {
    const includeAllBranches = String(req.query.allBranches).toLowerCase() === 'true';
    const repos = await fetchRepoStats(days, includeAllBranches);
    res.json({ generatedAt: new Date().toISOString(), days, allBranches: includeAllBranches, repos });
  } catch (err) {
    console.error('Failed to collect repo stats', err);
    res.status(502).json({ message: 'No se pudieron obtener las estadisticas de repositorios desde Gitea.' });
  }
});

router.get('/api/stats/export', async (req, res) => {
  const { error, value: days } = validateDaysParam(req.query.days);
  if (error) {
    res.status(400).json({ message: error });
    return;
  }

  try {
    const includeAllBranches = String(req.query.allBranches).toLowerCase() === 'true';
    const { users, repos } = await fetchActivityStats(days, includeAllBranches);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Panel Gitea';
    workbook.created = new Date();

    const usersSheet = workbook.addWorksheet('Usuarios');
    usersSheet.columns = [
      { header: 'Usuario', key: 'username', width: 24 },
      { header: 'Nombre visible', key: 'displayName', width: 32 },
      { header: 'Commits', key: 'commits', width: 12 },
      { header: 'Lineas cambiadas', key: 'linesChanged', width: 18 },
      { header: 'Repositorios', key: 'repositories', width: 14 },
      { header: 'Ultima actividad', key: 'lastActivity', width: 22 }
    ];
    users.forEach((user) => {
      usersSheet.addRow({
        username: user.username,
        displayName: user.displayName,
        commits: user.commits,
        linesChanged: user.linesChanged,
        repositories: user.repositories,
        lastActivity: user.lastActivity ? new Date(user.lastActivity) : null
      });
    });

    const reposSheet = workbook.addWorksheet('Repositorios');
    reposSheet.columns = [
      { header: 'Repositorio', key: 'fullName', width: 36 },
      { header: 'Commits', key: 'commits', width: 12 },
      { header: 'Lineas cambiadas', key: 'linesChanged', width: 18 },
      { header: 'Colaboradores', key: 'contributors', width: 16 },
      { header: 'Ultima actividad', key: 'lastActivity', width: 22 }
    ];
    repos.forEach((repo) => {
      reposSheet.addRow({
        fullName: repo.fullName,
        commits: repo.commits,
        linesChanged: repo.linesChanged,
        contributors: repo.contributors,
        lastActivity: repo.lastActivity ? new Date(repo.lastActivity) : null
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const suffix = includeAllBranches ? 'all-branches' : 'default-branch';
    res.setHeader('Content-Disposition', `attachment; filename="actividad-${days}d-${suffix}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Failed to generate Excel', err);
    if (!res.headersSent) {
      res.status(502).json({ message: 'No se pudo generar el reporte en Excel.' });
    } else {
      res.end();
    }
  }
});

router.use(express.static(path.join(__dirname, '..', 'public')));

if (BASE_PATH === '/') {
  app.use('/', router);
} else {
  app.use(BASE_PATH, router);
  app.get('/', (req, res) => {
    res.redirect(`${BASE_PATH}/`);
  });
}

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}${BASE_PATH === '/' ? '' : BASE_PATH}`);
});
