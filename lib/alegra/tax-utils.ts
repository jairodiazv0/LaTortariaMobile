/**
 * Tipos de documento oficiales aceptados por Alegra para Colombia.
 */
export const ALEGRA_IDENTIFICATION_TYPES = [
  { value: 'CC', label: 'Cédula de Ciudadanía (CC)' },
  { value: 'NIT', label: 'Número de Identificación Tributaria (NIT)' },
  { value: 'CE', label: 'Cédula de Extranjería (CE)' },
  { value: 'TI', label: 'Tarjeta de Identidad (TI)' },
  { value: 'PP', label: 'Pasaporte (PP)' },
  { value: 'PEP', label: 'Permiso Especial de Permanencia (PEP)' },
  { value: 'DIE', label: 'Documento de Identificación Extranjero (DIE)' },
  { value: 'FOREIGN_NIT', label: 'NIT de otro país (FOREIGN_NIT)' },
] as const;

export type AlegraIdentificationType = typeof ALEGRA_IDENTIFICATION_TYPES[number]['value'];

/**
 * Pesos ponderados oficiales según el estándar de la DIAN (Módulo 11)
 * para el cálculo del Dígito de Verificación (DV) de un NIT en Colombia.
 */
const DIAN_NIT_WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

/**
 * Calcula el Dígito de Verificación (DV) oficial de la DIAN para un NIT dado.
 * Si el NIT no es numérico o está vacío, retorna null.
 * 
 * @param nit Número de NIT limpio (solo dígitos, sin guiones ni espacios)
 * @returns Dígito de verificación como string ('0' a '9') o null si es inválido
 */
export function calculateNITVerificationDigit(nit: string): string | null {
  const cleanNit = nit.replace(/\D/g, '');
  if (!cleanNit || cleanNit.length === 0 || cleanNit.length > 15) {
    return null;
  }

  let sum = 0;
  const nitLength = cleanNit.length;

  for (let i = 0; i < nitLength; i++) {
    const digit = parseInt(cleanNit.charAt(nitLength - 1 - i), 10);
    const weight = DIAN_NIT_WEIGHTS[i] ?? 0;
    sum += digit * weight;
  }

  const remainder = sum % 11;

  if (remainder === 0) return '0';
  if (remainder === 1) return '1';
  return String(11 - remainder);
}

/**
 * Estructura estándar para datos fiscales guardados en orders.billing_address
 */
export interface OrderTaxBillingInfo {
  is_requested: boolean;
  document_type?: string;
  document_number?: string;
  verification_digit?: string | null;
  business_name?: string;
}
