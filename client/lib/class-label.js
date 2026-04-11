const normalizeText = (value) => String(value || '').trim();

export const formatClassLabel = (classItem, fallback = '-') => {
  const name = normalizeText(classItem?.name);
  const section = normalizeText(classItem?.section);

  if (!name && !section) {
    return fallback;
  }

  return name || fallback;
};

export const formatClassLabelFromValues = (name, section, fallback = '-') =>
  formatClassLabel({ name, section }, fallback);

export const formatClassLabelList = (classItems, fallback = '-') => {
  const labels = (Array.isArray(classItems) ? classItems : [])
    .map((item) => formatClassLabel(item, ''))
    .filter(Boolean);

  return labels.length > 0 ? labels.join(', ') : fallback;
};
