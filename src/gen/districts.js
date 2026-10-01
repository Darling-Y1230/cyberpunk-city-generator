import { STYLE } from '../../models/buildings.js';

/**
 * The sixteen mandated functional zones.
 *
 * Fourteen of them occupy ground and therefore compete for land in the zoning
 * solver. `underground` and `sky` are *volumetric* districts: they are carved
 * beneath and stacked above whichever ground district can structurally carry
 * them, which is how real cities actually work (the subnet follows the transit
 * spine; the aerial concessions follow the tallest cores).
 */
export const HORIZONTAL_IDS = [
  'cbd', 'corporate', 'research', 'industrial', 'port', 'residential',
  'luxury', 'slum', 'commercial', 'nightlife', 'medical', 'education',
  'datacenter', 'energy',
];

export const VOLUMETRIC_IDS = ['underground', 'sky'];

export const DISTRICT_IDS = [...HORIZONTAL_IDS, ...VOLUMETRIC_IDS];

export const DISTRICT_INDEX = Object.fromEntries(DISTRICT_IDS.map((id, i) => [id, i]));

export const WATER_CELL = 255;

/** Which massing builder a district's lots use, and with what bias. */
export const DISTRICT_FORM = {
  cbd: {
    kinds: [['tower', 0.62], ['commercial', 0.24], ['slab', 0.14]],
    styles: [STYLE.CURTAIN, STYLE.CURTAIN, STYLE.MONOLITH],
    podium: 0.72, spire: 0.68, adDensity: 1.25,
    props: ['ac', 'antenna', 'pad', 'holoEmitter', 'camera', 'railing', 'terminal'],
    undergroundAccess: 0.5,
  },
  corporate: {
    kinds: [['tower', 0.5], ['commercial', 0.26], ['monolith', 0.14], ['campus', 0.1]],
    styles: [STYLE.CURTAIN, STYLE.MONOLITH, STYLE.EMISSIVE],
    podium: 0.85, spire: 0.5, adDensity: 1.1,
    props: ['pad', 'antenna', 'camera', 'ac', 'railing', 'holoEmitter', 'terminal'],
    undergroundAccess: 0.35,
  },
  research: {
    kinds: [['campus', 0.52], ['monolith', 0.22], ['commercial', 0.16], ['tower', 0.1]],
    styles: [STYLE.MONOLITH, STYLE.CURTAIN, STYLE.CONCRETE],
    podium: 0.4, spire: 0.2, adDensity: 0.7,
    props: ['ac', 'vent', 'antenna', 'dish', 'planter', 'railing', 'camera'],
    undergroundAccess: 0.2,
  },
  industrial: {
    kinds: [['shed', 0.56], ['warehouse', 0.3], ['campus', 0.08], ['slab', 0.06]],
    styles: [STYLE.METAL, STYLE.CONCRETE],
    podium: 0.0, spire: 0.0, adDensity: 0.34,
    props: ['pipeRun', 'tank', 'vent', 'transformer', 'cableBox', 'barrier', 'dumpster', 'scaffold'],
    undergroundAccess: 0.12,
  },
  port: {
    kinds: [['warehouse', 0.66], ['shed', 0.24], ['campus', 0.1]],
    styles: [STYLE.METAL, STYLE.CONCRETE],
    podium: 0.0, spire: 0.0, adDensity: 0.3,
    props: ['tank', 'pipeRun', 'barrier', 'dumpster', 'transformer', 'railing', 'cableBox'],
    undergroundAccess: 0.08,
  },
  residential: {
    kinds: [['slab', 0.66], ['commercial', 0.2], ['campus', 0.08], ['tower', 0.06]],
    styles: [STYLE.CONCRETE, STYLE.CONCRETE, STYLE.CURTAIN],
    podium: 0.55, spire: 0.12, adDensity: 0.85,
    props: ['ac', 'dish', 'tank', 'vending', 'stall', 'trash', 'planter', 'railing', 'ladder', 'awning'],
    undergroundAccess: 0.3,
  },
  luxury: {
    kinds: [['slab', 0.52], ['tower', 0.28], ['campus', 0.1], ['commercial', 0.1]],
    styles: [STYLE.CURTAIN, STYLE.MONOLITH, STYLE.CONCRETE],
    podium: 0.6, spire: 0.3, adDensity: 0.5,
    props: ['planter', 'pad', 'railing', 'awning', 'vending', 'ac', 'terminal'],
    undergroundAccess: 0.22,
  },
  slum: {
    kinds: [['shack', 0.84], ['slab', 0.1], ['warehouse', 0.06]],
    styles: [STYLE.METAL, STYLE.CONCRETE],
    podium: 0.0, spire: 0.0, adDensity: 1.1,
    props: ['trash', 'ac', 'dish', 'vending', 'stall', 'scaffold', 'ladder', 'awning', 'tank', 'cableBox'],
    undergroundAccess: 0.55,
  },
  commercial: {
    kinds: [['commercial', 0.6], ['tower', 0.16], ['slab', 0.14], ['campus', 0.1]],
    styles: [STYLE.CURTAIN, STYLE.EMISSIVE, STYLE.CONCRETE],
    podium: 0.8, spire: 0.3, adDensity: 2.0,
    props: ['vending', 'stall', 'terminal', 'awning', 'holoEmitter', 'trash', 'planter', 'railing', 'ac', 'camera'],
    undergroundAccess: 0.45,
  },
  nightlife: {
    kinds: [['commercial', 0.66], ['slab', 0.18], ['shack', 0.1], ['tower', 0.06]],
    styles: [STYLE.EMISSIVE, STYLE.CURTAIN, STYLE.CONCRETE],
    podium: 0.9, spire: 0.25, adDensity: 2.4,
    props: ['stall', 'vending', 'terminal', 'holoEmitter', 'trash', 'awning', 'camera', 'ac', 'railing'],
    undergroundAccess: 0.6,
  },
  medical: {
    kinds: [['campus', 0.6], ['slab', 0.2], ['tower', 0.2]],
    styles: [STYLE.CONCRETE, STYLE.CURTAIN],
    podium: 0.5, spire: 0.2, adDensity: 0.55,
    props: ['pad', 'planter', 'railing', 'ac', 'terminal', 'vent', 'camera'],
    undergroundAccess: 0.25,
  },
  education: {
    kinds: [['campus', 0.68], ['slab', 0.16], ['commercial', 0.16]],
    styles: [STYLE.CONCRETE, STYLE.CURTAIN],
    podium: 0.35, spire: 0.1, adDensity: 0.45,
    props: ['planter', 'railing', 'ac', 'vending', 'dish', 'scaffold'],
    undergroundAccess: 0.2,
  },
  datacenter: {
    kinds: [['monolith', 0.62], ['shed', 0.18], ['campus', 0.2]],
    styles: [STYLE.MONOLITH, STYLE.CURTAIN, STYLE.METAL],
    podium: 0.3, spire: 0.15, adDensity: 0.5,
    props: ['ac', 'vent', 'transformer', 'pipeRun', 'camera', 'antenna', 'cableBox'],
    undergroundAccess: 0.18,
  },
  energy: {
    kinds: [['reactor', 0.58], ['shed', 0.24], ['warehouse', 0.18]],
    styles: [STYLE.METAL, STYLE.CONCRETE],
    podium: 0.0, spire: 0.0, adDensity: 0.24,
    props: ['transformer', 'pipeRun', 'tank', 'vent', 'cableBox', 'barrier'],
    undergroundAccess: 0.1,
  },
};

/** NPC behavioural profile per district, used to bias where crowds spawn. */
export const DISTRICT_POPULATION = {
  cbd: { day: 3.2, night: 1.0, occ: ['corp', 'corp', 'merchant', 'police', 'droneop'] },
  corporate: { day: 2.6, night: 0.7, occ: ['corp', 'corp', 'engineer', 'police', 'merc'] },
  research: { day: 1.8, night: 0.8, occ: ['engineer', 'student', 'hacker', 'corp'] },
  industrial: { day: 2.0, night: 0.9, occ: ['engineer', 'tech', 'droneop', 'merc'] },
  port: { day: 1.7, night: 1.2, occ: ['tech', 'engineer', 'droneop', 'drifter', 'merc'] },
  residential: { day: 1.2, night: 1.5, occ: ['citizen', 'student', 'medic', 'vendor', 'tech'] },
  luxury: { day: 1.0, night: 1.0, occ: ['corp', 'merchant', 'medic', 'citizen'] },
  slum: { day: 1.8, night: 2.4, occ: ['drifter', 'hacker', 'vendor', 'merc', 'citizen'] },
  commercial: { day: 2.2, night: 2.6, occ: ['merchant', 'citizen', 'vendor', 'student', 'police'] },
  nightlife: { day: 0.8, night: 3.4, occ: ['citizen', 'vendor', 'merc', 'hacker', 'merchant'] },
  medical: { day: 1.5, night: 1.4, occ: ['medic', 'citizen', 'corp'] },
  education: { day: 2.0, night: 0.5, occ: ['student', 'student', 'engineer'] },
  datacenter: { day: 1.4, night: 1.1, occ: ['engineer', 'droneop', 'police'] },
  energy: { day: 1.3, night: 1.0, occ: ['engineer', 'tech', 'merc'] },
  underground: { day: 1.6, night: 2.0, occ: ['hacker', 'drifter', 'merc', 'vendor'] },
  sky: { day: 1.4, night: 0.9, occ: ['corp', 'merchant', 'citizen'] },
};

export function isVolumetric(id) { return VOLUMETRIC_IDS.includes(id); }
