let nextMaterialInstanceId = 0;

export function createMaterialInstanceName(prefix: string): string {
  const id = nextMaterialInstanceId++;
  return `${prefix}_${id}`;
}
