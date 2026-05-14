export type CropCategory = 'Leafy Green' | 'Herb'

export type CropId = 'lettuce' | 'basil' | 'kale' | 'mint'

export type CropProfile = {
  id: CropId
  name: string
  category: CropCategory
  growthDays: string
  yieldPerGrid: number
  accent: string
  pricePerKg: number
  seedlingsPerGrid: number
  nurseryLeadWeeks: number
}

export const cropLibrary: CropProfile[] = [
  {
    id: 'lettuce',
    name: 'Lettuce',
    category: 'Leafy Green',
    growthDays: '28-35 days',
    yieldPerGrid: 1.2,
    accent: '#9edb66',
    pricePerKg: 4.0,
    seedlingsPerGrid: 6,
    nurseryLeadWeeks: 2,
  },
  {
    id: 'basil',
    name: 'Basil',
    category: 'Herb',
    growthDays: '25-30 days',
    yieldPerGrid: 0.6,
    accent: '#86c56a',
    pricePerKg: 10.0,
    seedlingsPerGrid: 8,
    nurseryLeadWeeks: 2,
  },
  {
    id: 'kale',
    name: 'Kale',
    category: 'Leafy Green',
    growthDays: '30-40 days',
    yieldPerGrid: 1.4,
    accent: '#64b95d',
    pricePerKg: 5.0,
    seedlingsPerGrid: 4,
    nurseryLeadWeeks: 3,
  },
  {
    id: 'mint',
    name: 'Mint',
    category: 'Herb',
    growthDays: '25-30 days',
    yieldPerGrid: 0.5,
    accent: '#73d0a8',
    pricePerKg: 8.0,
    seedlingsPerGrid: 8,
    nurseryLeadWeeks: 2,
  },
]
