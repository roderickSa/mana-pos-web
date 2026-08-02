import type { SupplierDto } from '@/shared/types';
import { getJson, sendJson } from '@/shared/api/client';

export async function listSuppliers(): Promise<SupplierDto[]> {
  return getJson('/suppliers');
}

export async function createSupplier(name: string): Promise<SupplierDto> {
  return sendJson('POST', '/suppliers', { name });
}

export async function updateSupplier(
  id: string,
  payload: {
    name: string;
    phone: string | null;
    notes: string | null;
    visitDays: string[];
    contactName: string | null;
    paymentTerms: string | null;
    active: boolean;
  },
): Promise<SupplierDto> {
  return sendJson('PUT', `/suppliers/${id}`, payload);
}
