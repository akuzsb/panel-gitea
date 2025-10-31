const axios = require('axios');

const DEFAULT_TIMEOUT_MS = 30_000;

function buildBaseUrl() {
  const host = process.env.URL_GITEA_HOST;
  const port = process.env.URL_GITEA_PORT;

  if (!host) {
    throw new Error('La variable de entorno URL_GITEA_HOST es obligatoria.');
  }

  try {
    const url = new URL(host);
    if (port && !host.includes(':', url.protocol.length + 2)) {
      url.port = String(port);
    }
    url.pathname = url.pathname.replace(/\/$/, '') + '/api/v1';
    return url.toString().replace(/\/$/, '');
  } catch (error) {
    throw new Error('La variable URL_GITEA_HOST debe incluir el protocolo, por ejemplo "http://gitea.local".');
  }
}

const baseURL = buildBaseUrl();
const apiKey = process.env.URL_GITEA_API_KEY;

if (!apiKey) {
  throw new Error('La variable de entorno URL_GITEA_API_KEY es obligatoria.');
}

const gitea = axios.create({
  baseURL,
  headers: {
    Authorization: `token ${apiKey}`
  },
  timeout: DEFAULT_TIMEOUT_MS
});

gitea.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const { status, config } = error.response;
      const sanitizedUrl = `${config.method?.toUpperCase()} ${config.url}`;
      console.error(`Gitea API error ${status} on ${sanitizedUrl}`);
    } else {
      console.error('Gitea API request failed', error.message);
    }
    return Promise.reject(error);
  }
);

module.exports = {
  gitea
};
