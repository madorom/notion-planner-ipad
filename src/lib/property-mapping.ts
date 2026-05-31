export function mappingValues(value?: string | string[]) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.filter(Boolean)));
  }

  return value ? [value] : [];
}

export function firstMappingValue(value?: string | string[]) {
  return mappingValues(value)[0];
}

export function toggleMappingValue(
  value: string | string[] | undefined,
  item: string,
) {
  const current = mappingValues(value);
  return current.includes(item)
    ? current.filter((entry) => entry !== item)
    : [...current, item];
}
