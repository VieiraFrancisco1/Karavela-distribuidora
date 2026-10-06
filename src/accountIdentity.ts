const PHONE_DOMAIN = '@telefone.karavela.invalid'
export function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, '')
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2)
  if (!/^\d{10,11}$/.test(digits)) throw new Error('Informe o telefone com DDD, como (88) 99999-9999.')
  return '55' + digits
}
export function accountIdentity(value: string) {
  const input = value.trim().toLowerCase()
  if (input.includes('@')) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input) || input.endsWith(PHONE_DOMAIN)) throw new Error('Informe um email válido.')
    return { email: input, phone: '', kind: 'email' as const }
  }
  const phone = normalizePhone(input)
  return { email: phone + PHONE_DOMAIN, phone, kind: 'phone' as const }
}
export const isPhoneAccount = (email?: string | null) => Boolean(email?.endsWith(PHONE_DOMAIN))
