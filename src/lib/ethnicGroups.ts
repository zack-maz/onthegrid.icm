/**
 * Ethnic group configuration for the Middle East ethnic distribution overlay.
 * Defines the 10 major ethnic zones with colors, populations, and context.
 *
 * Phase 28.1 W6 D-13 — color and rgba fields source from src/lib/colorBridge.ts
 * which reads --color-ethnic-* CSS @theme vars at module load. Single source
 * of truth at the @theme level. The fixed alpha=140 (~55% fill, used by the
 * canvas hatch pattern in EthnicOverlay) is owned by this module — bridge
 * tuples are 3-channel (r,g,b); the alpha is appended here.
 */
import {
  COLOR_ETHNIC_KURDISH,
  COLOR_ETHNIC_ARAB,
  COLOR_ETHNIC_PERSIAN,
  COLOR_ETHNIC_BALOCH,
  COLOR_ETHNIC_TURKMEN,
  COLOR_ETHNIC_DRUZE,
  COLOR_ETHNIC_ALAWITE,
  COLOR_ETHNIC_YAZIDI,
  COLOR_ETHNIC_ASSYRIAN,
  COLOR_ETHNIC_PASHTUN,
  COLOR_ETHNIC_KURDISH_HEX,
  COLOR_ETHNIC_ARAB_HEX,
  COLOR_ETHNIC_PERSIAN_HEX,
  COLOR_ETHNIC_BALOCH_HEX,
  COLOR_ETHNIC_TURKMEN_HEX,
  COLOR_ETHNIC_DRUZE_HEX,
  COLOR_ETHNIC_ALAWITE_HEX,
  COLOR_ETHNIC_YAZIDI_HEX,
  COLOR_ETHNIC_ASSYRIAN_HEX,
  COLOR_ETHNIC_PASHTUN_HEX,
} from '@/lib/colorBridge';

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

/** Fixed alpha for ethnic-zone fills (~55%). Owned here, not in @theme. */
const ETHNIC_ALPHA = 140;

/** Compose an [r,g,b,alpha] rgba tuple from a 3-channel bridge tuple. */
function withAlpha(
  rgb: readonly [number, number, number],
  alpha: number,
): [number, number, number, number] {
  return [rgb[0], rgb[1], rgb[2], alpha];
}

export const ETHNIC_GROUPS: Record<EthnicGroup, EthnicGroupConfig> = {
  kurdish: {
    id: 'kurdish',
    label: 'Kurdish',
    color: COLOR_ETHNIC_KURDISH_HEX,
    rgba: withAlpha(COLOR_ETHNIC_KURDISH, ETHNIC_ALPHA),
    population: '30-40M',
    context: 'SE Turkey, N Iraq, NE Syria, W Iran',
  },
  arab: {
    id: 'arab',
    label: 'Arab',
    color: COLOR_ETHNIC_ARAB_HEX,
    rgba: withAlpha(COLOR_ETHNIC_ARAB, ETHNIC_ALPHA),
    population: '200M+',
    context: 'Arabian Peninsula, Iraq, Levant',
  },
  persian: {
    id: 'persian',
    label: 'Persian',
    color: COLOR_ETHNIC_PERSIAN_HEX,
    rgba: withAlpha(COLOR_ETHNIC_PERSIAN, ETHNIC_ALPHA),
    population: '50-60M',
    context: 'Central/eastern Iran',
  },
  baloch: {
    id: 'baloch',
    label: 'Baloch',
    color: COLOR_ETHNIC_BALOCH_HEX,
    rgba: withAlpha(COLOR_ETHNIC_BALOCH, ETHNIC_ALPHA),
    population: '10-15M',
    context: 'SE Iran, SW Pakistan',
  },
  turkmen: {
    id: 'turkmen',
    label: 'Turkmen',
    color: COLOR_ETHNIC_TURKMEN_HEX,
    rgba: withAlpha(COLOR_ETHNIC_TURKMEN, ETHNIC_ALPHA),
    population: '7-10M',
    context: 'Turkmenistan, NE Iran, N Iraq pockets',
  },
  druze: {
    id: 'druze',
    label: 'Druze',
    color: COLOR_ETHNIC_DRUZE_HEX,
    rgba: withAlpha(COLOR_ETHNIC_DRUZE, ETHNIC_ALPHA),
    population: '1-2M',
    context: 'S Lebanon, SW Syria, N Israel',
  },
  alawite: {
    id: 'alawite',
    label: 'Alawite',
    color: COLOR_ETHNIC_ALAWITE_HEX,
    rgba: withAlpha(COLOR_ETHNIC_ALAWITE, ETHNIC_ALPHA),
    population: '2-3M',
    context: 'NW Syria coast',
  },
  yazidi: {
    id: 'yazidi',
    label: 'Yazidi',
    color: COLOR_ETHNIC_YAZIDI_HEX,
    rgba: withAlpha(COLOR_ETHNIC_YAZIDI, ETHNIC_ALPHA),
    population: '500K-1M',
    context: 'Sinjar, N Iraq',
  },
  assyrian: {
    id: 'assyrian',
    label: 'Assyrian',
    color: COLOR_ETHNIC_ASSYRIAN_HEX,
    rgba: withAlpha(COLOR_ETHNIC_ASSYRIAN, ETHNIC_ALPHA),
    population: '2-3M',
    context: 'Nineveh Plains, Khabur',
  },
  pashtun: {
    id: 'pashtun',
    label: 'Pashtun',
    color: COLOR_ETHNIC_PASHTUN_HEX,
    rgba: withAlpha(COLOR_ETHNIC_PASHTUN, ETHNIC_ALPHA),
    population: '50-60M',
    context: 'E/S Afghanistan, NW Pakistan',
  },
};

export const ETHNIC_GROUP_IDS: EthnicGroup[] = Object.keys(ETHNIC_GROUPS) as EthnicGroup[];
