export interface CategoryOption {
  key: string | null;
  label: string;
}

export const CATEGORIES: CategoryOption[] = [
  { key: null, label: 'Todos' },
  { key: 'frutas-verduras', label: 'Frutas y verduras' },
  { key: 'abarrotes', label: 'Abarrotes' },
  { key: 'bebidas', label: 'Bebidas' },
  { key: 'limpieza', label: 'Limpieza' },
  { key: 'pan', label: 'Pan' },
];
