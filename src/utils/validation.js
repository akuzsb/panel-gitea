const ALLOWED_WINDOWS = [1, 7, 15, 30];

function validateDaysParam(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return { value: 7 };
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || !ALLOWED_WINDOWS.includes(parsed)) {
    return { error: `El parametro "days" debe ser uno de: ${ALLOWED_WINDOWS.join(', ')}` };
  }

  return { value: parsed };
}

module.exports = {
  validateDaysParam,
  ALLOWED_WINDOWS
};
