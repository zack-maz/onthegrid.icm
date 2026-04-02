/**
 * Ethnic group configuration for the Middle East ethnic distribution overlay.
 * Defines the 10 major ethnic zones with colors, populations, and context.
 */

export type EthnicGroup =
  | 'kurdish'
  | 'arab'
  | 'persian'
  | 'baloch'
  | 'turkmen'
  | 'druze'
  | 'alawite'
  | 'yazidi'
  | 'assyrian'
  | 'pashtun';

export interface EthnicGroupConfig {
  id: EthnicGroup;
  label: string;
  color: string;
  rgba: [number, number, number, number];
  population: string;
  context: string;
}

export const ETHNIC_GROUPS: Record<EthnicGroup, EthnicGroupConfig> = {
  kurdish: {
    id: 'kurdish',
    label: 'Kurdish',
    color: '#f59e0b',
    rgba: [245, 158, 11, 140],
    population: '30-40M',
    context: 'SE Turkey, N Iraq, NE Syria, W Iran',
  },
  arab: {
    id: 'arab',
    label: 'Arab',
    color: '#10b981',
    rgba: [16, 185, 129, 140],
    population: '200M+',
    context: 'Arabian Peninsula, Iraq, Levant',
  },
  persian: {
    id: 'persian',
    label: 'Persian',
    color: '#6366f1',
    rgba: [99, 102, 241, 140],
    population: '50-60M',
    context: 'Central/eastern Iran',
  },
  baloch: {
    id: 'baloch',
    label: 'Baloch',
    color: '#ec4899',
    rgba: [236, 72, 153, 140],
    population: '10-15M',
    context: 'SE Iran, SW Pakistan',
  },
  turkmen: {
    id: 'turkmen',
    label: 'Turkmen',
    color: '#14b8a6',
    rgba: [20, 184, 166, 140],
    population: '7-10M',
    context: 'Turkmenistan, NE Iran, N Iraq pockets',
  },
  druze: {
    id: 'druze',
    label: 'Druze',
    color: '#f97316',
    rgba: [249, 115, 22, 140],
    population: '1-2M',
    context: 'S Lebanon, SW Syria, N Israel',
  },
  alawite: {
    id: 'alawite',
    label: 'Alawite',
    color: '#8b5cf6',
    rgba: [139, 92, 246, 140],
    population: '2-3M',
    context: 'NW Syria coast',
  },
  yazidi: {
    id: 'yazidi',
    label: 'Yazidi',
    color: '#eab308',
    rgba: [234, 179, 8, 140],
    population: '500K-1M',
    context: 'Sinjar, N Iraq',
  },
  assyrian: {
    id: 'assyrian',
    label: 'Assyrian',
    color: '#06b6d4',
    rgba: [6, 182, 212, 140],
    population: '2-3M',
    context: 'Nineveh Plains, Khabur',
  },
  pashtun: {
    id: 'pashtun',
    label: 'Pashtun',
    color: '#84cc16',
    rgba: [132, 204, 22, 140],
    population: '50-60M',
    context: 'E/S Afghanistan, NW Pakistan',
  },
};

export const ETHNIC_GROUP_IDS: EthnicGroup[] = Object.keys(ETHNIC_GROUPS) as EthnicGroup[];
