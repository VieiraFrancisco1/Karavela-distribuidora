const shortLabels: Record<string, string> = {
  'Cervejas 300 ml — Caixa': 'Cervejas Caixas',
  'Cervejas Long Neck': 'Cerveja Long',
  'Cervejas Zero Álcool': 'Cerveja Zero',
}

export default function CategoryCardLabel({ label }: { label: string }) {
  return <span className="category-card-label" title={label}>{shortLabels[label] ?? label}</span>
}
