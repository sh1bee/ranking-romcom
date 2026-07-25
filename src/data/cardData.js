export const CARD_DATA = [
  // S Tier (4 items)
  { id: 's1', title: 'AETHER SUITE', tier: 'S', score: 99, category: 'Interior Design', solidColor: '#9B51E0', gradient: ['#9B51E0', '#7928CA'], icon: '🏛️' },
  { id: 's2', title: 'SUNSET LOUNGE', tier: 'S', score: 98, category: 'Architecture', solidColor: '#F2994A', gradient: ['#F2994A', '#FF5722'], icon: '🌅' },
  { id: 's3', title: 'VERDANT STUDIO', tier: 'S', score: 97, category: 'Eco Living', solidColor: '#27AE60', gradient: ['#27AE60', '#10B981'], icon: '🌿' },
  { id: 's4', title: 'SOLAR HEAVEN', tier: 'S', score: 96, category: 'Penthouse', solidColor: '#F2C94C', gradient: ['#F2C94C', '#FFC107'], icon: '☀️' },

  // A Tier (4 items)
  { id: 'a1', title: 'AZURE LOFT', tier: 'A', score: 93, category: 'Modern Living', solidColor: '#2F80ED', gradient: ['#2F80ED', '#3B82F6'], icon: '🏙️' },
  { id: 'a2', title: 'CRIMSON CORNER', tier: 'A', score: 91, category: 'Urban Design', solidColor: '#EB5757', gradient: ['#EB5757', '#EF4444'], icon: '🌆' },
  { id: 'a3', title: 'AMETHYST HAVEN', tier: 'A', score: 89, category: 'Luxury Room', solidColor: '#9B51E0', gradient: ['#9B51E0', '#8B5CF6'], icon: '🔮' },
  { id: 'a4', title: 'EMERALD BAY', tier: 'A', score: 88, category: 'Villa Terrace', solidColor: '#27AE60', gradient: ['#27AE60', '#059669'], icon: '🏡' },

  // B Tier (4 items)
  { id: 'b1', title: 'AMBER VISTA', tier: 'B', score: 84, category: 'Boutique Space', solidColor: '#F2994A', gradient: ['#F2994A', '#F59E0B'], icon: '🛋️' },
  { id: 'b2', title: 'COBALT CABIN', tier: 'B', score: 82, category: 'Minimalist Studio', solidColor: '#2F80ED', gradient: ['#2F80ED', '#1D4ED8'], icon: '⛵' },
  { id: 'b3', title: 'GOLDEN HOUR', tier: 'B', score: 80, category: 'Cozy Apartment', solidColor: '#F2C94C', gradient: ['#F2C94C', '#EAB308'], icon: '✨' },
  { id: 'b4', title: 'RUBY SANCTUARY', tier: 'B', score: 79, category: 'Contemporary', solidColor: '#EB5757', gradient: ['#EB5757', '#DC2626'], icon: '👑' },

  // C Tier (4 items)
  { id: 'c1', title: 'PURPLE NEST', tier: 'C', score: 74, category: 'Compact Living', solidColor: '#9B51E0', gradient: ['#9B51E0', '#A855F7'], icon: '🪑' },
  { id: 'c2', title: 'CITRUS FLAT', tier: 'C', score: 71, category: 'Budget Studio', solidColor: '#F2994A', gradient: ['#F2994A', '#FB923C'], icon: '🍊' },
  { id: 'c3', title: 'MINT BALCONY', tier: 'C', score: 68, category: 'Micro Apartment', solidColor: '#27AE60', gradient: ['#27AE60', '#34D399'], icon: '🪴' },
  { id: 'c4', title: 'OCEAN DECK', tier: 'C', score: 65, category: 'Waterfront', solidColor: '#2F80ED', gradient: ['#2F80ED', '#60A5FA'], icon: '🏖️' }
];

export const TIER_CONFIG = {
  Peak: { label: 'GOD TIER', color: '#0ea5e9', bgGradient: 'linear-gradient(135deg, #e0f2fe, #bae6fd)' },
  S: { label: 'MASTERPIECE', color: '#f59e0b', bgGradient: 'linear-gradient(135deg, #fef3c7, #fde68a)' },
  A: { label: 'AMAZING', color: '#ef4444', bgGradient: 'linear-gradient(135deg, #fee2e2, #fecaca)' },
  B: { label: 'GOOD', color: '#8b5cf6', bgGradient: 'linear-gradient(135deg, #ede9fe, #ddd6fe)' },
  C: { label: 'AVERAGE', color: '#3b82f6', bgGradient: 'linear-gradient(135deg, #dbeafe, #bfdbfe)' },
  Trash: { label: 'GARBAGE', color: '#78350f', bgGradient: 'linear-gradient(135deg, #fef3c7, #d4a373)' }
};
