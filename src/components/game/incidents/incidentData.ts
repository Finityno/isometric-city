/**
 * Incident Data - Crime types, fire types, and their descriptions
 * Comprehensive incident system for city simulation
 *
 * Performance optimizations:
 * - Pre-computed weighted arrays for O(1) random selection
 * - Frozen objects for immutability
 * - Const assertions for literal types
 * - Pre-computed lookup Maps for O(1) access
 */

// ============================================================================
// SEVERITY TYPES (const for better tree-shaking)
// ============================================================================

export const CRIME_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;

export const FIRE_SEVERITY = {
  MINOR: 'minor',
  MODERATE: 'moderate',
  MAJOR: 'major',
  CATASTROPHIC: 'catastrophic',
} as const;

export type CrimeSeverity = (typeof CRIME_SEVERITY)[keyof typeof CRIME_SEVERITY];
export type FireSeverity = (typeof FIRE_SEVERITY)[keyof typeof FIRE_SEVERITY];

// ============================================================================
// CRIME TYPES
// ============================================================================

export const CRIME_TYPES = [
  // Violent Crimes
  'armed_robbery',
  'mugging',
  'assault',
  'aggravated_assault',
  'carjacking',
  'kidnapping',
  'hostage_situation',
  'gang_violence',
  'shooting',
  'stabbing',
  // Property Crimes
  'burglary',
  'home_invasion',
  'commercial_burglary',
  'car_theft',
  'bike_theft',
  'package_theft',
  'shoplifting',
  'smash_and_grab',
  'warehouse_theft',
  'construction_theft',
  // Financial Crimes
  'fraud',
  'identity_theft',
  'credit_card_fraud',
  'insurance_fraud',
  'embezzlement',
  'counterfeiting',
  // Public Order
  'disturbance',
  'public_intoxication',
  'disorderly_conduct',
  'noise_complaint',
  'loitering',
  'trespassing',
  'public_urination',
  'street_racing',
  'illegal_dumping',
  // Drug Related
  'drug_dealing',
  'drug_possession',
  'illegal_dispensary',
  'public_drug_use',
  // Traffic & Vehicle
  'hit_and_run',
  'dui',
  'reckless_driving',
  'traffic_violation',
  'parking_violation',
  'illegal_street_vendor',
  // Vandalism & Destruction
  'vandalism',
  'graffiti',
  'arson_attempt',
  'property_damage',
  'broken_windows',
  // Other
  'suspicious_activity',
  'prowler',
  'stalking',
  'domestic_disturbance',
  'animal_cruelty',
  'illegal_gambling',
  'prostitution',
  'solicitation',
] as const;

export type CrimeType = (typeof CRIME_TYPES)[number];

export interface CrimeData {
  readonly name: string;
  readonly description: string;
  readonly severity: CrimeSeverity;
  readonly duration: number; // seconds before incident expires if unresponded
  readonly weight: number; // relative spawn frequency (higher = more common)
}

const CRIME_DATA_INTERNAL: Record<CrimeType, CrimeData> = {
  // Violent Crimes (critical/high severity, longer duration)
  armed_robbery: {
    name: 'Armed Robbery',
    description: 'Armed suspect threatening civilians. Weapon drawn.',
    severity: 'critical',
    duration: 45,
    weight: 3,
  },
  mugging: {
    name: 'Mugging',
    description: 'Victim being robbed on the street. Suspect fleeing.',
    severity: 'high',
    duration: 30,
    weight: 5,
  },
  assault: {
    name: 'Assault',
    description: 'Physical altercation in progress. Multiple individuals.',
    severity: 'high',
    duration: 25,
    weight: 6,
  },
  aggravated_assault: {
    name: 'Aggravated Assault',
    description: 'Violent attack with potential weapon. Victim injured.',
    severity: 'critical',
    duration: 40,
    weight: 2,
  },
  carjacking: {
    name: 'Carjacking',
    description: 'Armed suspect stealing vehicle from driver.',
    severity: 'critical',
    duration: 35,
    weight: 2,
  },
  kidnapping: {
    name: 'Kidnapping',
    description: 'Individual being forced into vehicle. Urgent response.',
    severity: 'critical',
    duration: 50,
    weight: 1,
  },
  hostage_situation: {
    name: 'Hostage Situation',
    description: 'Armed suspect holding hostages. Negotiator needed.',
    severity: 'critical',
    duration: 60,
    weight: 0.5,
  },
  gang_violence: {
    name: 'Gang Violence',
    description: 'Rival groups in confrontation. Multiple suspects.',
    severity: 'critical',
    duration: 40,
    weight: 2,
  },
  shooting: {
    name: 'Shots Fired',
    description: 'Gunshots reported. Possible casualties.',
    severity: 'critical',
    duration: 45,
    weight: 1,
  },
  stabbing: {
    name: 'Stabbing',
    description: 'Knife attack reported. Medical response needed.',
    severity: 'critical',
    duration: 40,
    weight: 1.5,
  },

  // Property Crimes (medium/high severity)
  burglary: {
    name: 'Burglary',
    description: 'Break-in detected. Suspect inside building.',
    severity: 'high',
    duration: 30,
    weight: 8,
  },
  home_invasion: {
    name: 'Home Invasion',
    description: 'Intruder in occupied residence. Residents in danger.',
    severity: 'critical',
    duration: 35,
    weight: 3,
  },
  commercial_burglary: {
    name: 'Commercial Burglary',
    description: 'Business break-in in progress. Alarm triggered.',
    severity: 'high',
    duration: 28,
    weight: 6,
  },
  car_theft: {
    name: 'Car Theft',
    description: 'Vehicle being stolen. Suspect breaking into car.',
    severity: 'medium',
    duration: 22,
    weight: 10,
  },
  bike_theft: {
    name: 'Bike Theft',
    description: 'Bicycle being stolen. Suspect cutting lock.',
    severity: 'low',
    duration: 15,
    weight: 12,
  },
  package_theft: {
    name: 'Package Theft',
    description: 'Porch pirate stealing delivered packages.',
    severity: 'low',
    duration: 12,
    weight: 15,
  },
  shoplifting: {
    name: 'Shoplifting',
    description: 'Theft in progress at retail store. Suspect fleeing.',
    severity: 'low',
    duration: 15,
    weight: 20,
  },
  smash_and_grab: {
    name: 'Smash & Grab',
    description: 'Window smashed. Multiple suspects grabbing merchandise.',
    severity: 'high',
    duration: 25,
    weight: 4,
  },
  warehouse_theft: {
    name: 'Warehouse Theft',
    description: 'Large-scale theft at industrial facility.',
    severity: 'high',
    duration: 35,
    weight: 3,
  },
  construction_theft: {
    name: 'Construction Theft',
    description: 'Equipment or materials being stolen from site.',
    severity: 'medium',
    duration: 25,
    weight: 5,
  },

  // Financial Crimes
  fraud: {
    name: 'Fraud',
    description: 'Suspected fraud scheme. Victim reporting financial loss.',
    severity: 'medium',
    duration: 30,
    weight: 4,
  },
  identity_theft: {
    name: 'Identity Theft',
    description: 'Personal information being used fraudulently.',
    severity: 'medium',
    duration: 30,
    weight: 3,
  },
  credit_card_fraud: {
    name: 'Credit Card Fraud',
    description: 'Unauthorized card transactions in progress.',
    severity: 'medium',
    duration: 25,
    weight: 5,
  },
  insurance_fraud: {
    name: 'Insurance Fraud',
    description: 'Staged accident or false claim detected.',
    severity: 'medium',
    duration: 35,
    weight: 2,
  },
  embezzlement: {
    name: 'Embezzlement',
    description: 'Employee caught stealing company funds.',
    severity: 'high',
    duration: 40,
    weight: 1,
  },
  counterfeiting: {
    name: 'Counterfeiting',
    description: 'Fake currency or goods being distributed.',
    severity: 'high',
    duration: 35,
    weight: 2,
  },

  // Public Order (low/medium severity, short duration)
  disturbance: {
    name: 'Public Disturbance',
    description: 'Loud argument escalating. Crowd gathering.',
    severity: 'low',
    duration: 18,
    weight: 25,
  },
  public_intoxication: {
    name: 'Public Intoxication',
    description: 'Heavily intoxicated individual causing disruption.',
    severity: 'low',
    duration: 15,
    weight: 18,
  },
  disorderly_conduct: {
    name: 'Disorderly Conduct',
    description: 'Individual refusing to comply. Causing scene.',
    severity: 'low',
    duration: 18,
    weight: 15,
  },
  noise_complaint: {
    name: 'Noise Complaint',
    description: 'Excessive noise disturbing neighborhood.',
    severity: 'low',
    duration: 12,
    weight: 20,
  },
  loitering: {
    name: 'Loitering',
    description: 'Suspicious individuals hanging around property.',
    severity: 'low',
    duration: 10,
    weight: 12,
  },
  trespassing: {
    name: 'Trespassing',
    description: 'Unauthorized person on private property.',
    severity: 'low',
    duration: 15,
    weight: 14,
  },
  public_urination: {
    name: 'Public Urination',
    description: 'Indecent act in public area.',
    severity: 'low',
    duration: 8,
    weight: 10,
  },
  street_racing: {
    name: 'Street Racing',
    description: 'Vehicles racing at dangerous speeds.',
    severity: 'high',
    duration: 20,
    weight: 4,
  },
  illegal_dumping: {
    name: 'Illegal Dumping',
    description: 'Unauthorized waste being dumped.',
    severity: 'low',
    duration: 20,
    weight: 6,
  },

  // Drug Related
  drug_dealing: {
    name: 'Drug Deal',
    description: 'Suspected narcotics transaction in progress.',
    severity: 'high',
    duration: 20,
    weight: 8,
  },
  drug_possession: {
    name: 'Drug Possession',
    description: 'Individual with suspected controlled substances.',
    severity: 'medium',
    duration: 18,
    weight: 10,
  },
  illegal_dispensary: {
    name: 'Illegal Dispensary',
    description: 'Unlicensed drug operation discovered.',
    severity: 'high',
    duration: 35,
    weight: 2,
  },
  public_drug_use: {
    name: 'Public Drug Use',
    description: 'Individual using substances openly.',
    severity: 'low',
    duration: 15,
    weight: 12,
  },

  // Traffic & Vehicle
  hit_and_run: {
    name: 'Hit & Run',
    description: 'Driver fled after collision. Possible injuries.',
    severity: 'high',
    duration: 25,
    weight: 6,
  },
  dui: {
    name: 'DUI',
    description: 'Suspected impaired driver. Erratic behavior.',
    severity: 'high',
    duration: 22,
    weight: 7,
  },
  reckless_driving: {
    name: 'Reckless Driving',
    description: 'Vehicle driving dangerously. Endangering others.',
    severity: 'medium',
    duration: 18,
    weight: 10,
  },
  traffic_violation: {
    name: 'Traffic Violation',
    description: 'Moving violation observed. Driver being cited.',
    severity: 'low',
    duration: 12,
    weight: 25,
  },
  parking_violation: {
    name: 'Parking Violation',
    description: 'Illegally parked vehicle blocking access.',
    severity: 'low',
    duration: 10,
    weight: 20,
  },
  illegal_street_vendor: {
    name: 'Illegal Vendor',
    description: 'Unlicensed vendor operating without permit.',
    severity: 'low',
    duration: 15,
    weight: 8,
  },

  // Vandalism & Destruction
  vandalism: {
    name: 'Vandalism',
    description: 'Property being damaged or destroyed.',
    severity: 'medium',
    duration: 18,
    weight: 12,
  },
  graffiti: {
    name: 'Graffiti',
    description: 'Individual spray painting building or surface.',
    severity: 'low',
    duration: 15,
    weight: 15,
  },
  arson_attempt: {
    name: 'Attempted Arson',
    description: 'Individual attempting to start fire. Urgent.',
    severity: 'critical',
    duration: 30,
    weight: 2,
  },
  property_damage: {
    name: 'Property Damage',
    description: 'Intentional destruction of property in progress.',
    severity: 'medium',
    duration: 20,
    weight: 8,
  },
  broken_windows: {
    name: 'Broken Windows',
    description: 'Windows being smashed. Possible burglary.',
    severity: 'medium',
    duration: 18,
    weight: 10,
  },

  // Other
  suspicious_activity: {
    name: 'Suspicious Activity',
    description: 'Unknown individual acting strangely near building.',
    severity: 'low',
    duration: 15,
    weight: 18,
  },
  prowler: {
    name: 'Prowler',
    description: 'Individual lurking around property at night.',
    severity: 'medium',
    duration: 18,
    weight: 8,
  },
  stalking: {
    name: 'Stalking',
    description: 'Person being followed by unknown individual.',
    severity: 'high',
    duration: 25,
    weight: 3,
  },
  domestic_disturbance: {
    name: 'Domestic Disturbance',
    description: 'Heated argument at residence. Possible violence.',
    severity: 'high',
    duration: 25,
    weight: 10,
  },
  animal_cruelty: {
    name: 'Animal Cruelty',
    description: 'Animal being mistreated or endangered.',
    severity: 'medium',
    duration: 20,
    weight: 3,
  },
  illegal_gambling: {
    name: 'Illegal Gambling',
    description: 'Unlicensed gambling operation discovered.',
    severity: 'medium',
    duration: 30,
    weight: 2,
  },
  prostitution: {
    name: 'Prostitution',
    description: 'Illegal activity reported in area.',
    severity: 'medium',
    duration: 20,
    weight: 4,
  },
  solicitation: {
    name: 'Solicitation',
    description: 'Aggressive soliciting of passersby.',
    severity: 'low',
    duration: 12,
    weight: 8,
  },
};

// Freeze the crime data for immutability (prevents accidental mutations, enables V8 optimizations)
export const CRIME_DATA: Readonly<Record<CrimeType, CrimeData>> =
  Object.freeze(CRIME_DATA_INTERNAL);

// Pre-compute cumulative weights for O(1) binary search random selection
interface WeightedEntry<T> {
  readonly type: T;
  readonly cumulativeWeight: number;
}

function buildCumulativeWeights<T extends string>(
  types: readonly T[],
  getData: (type: T) => { weight: number }
): { entries: readonly WeightedEntry<T>[]; totalWeight: number } {
  let cumulative = 0;
  const entries: WeightedEntry<T>[] = new Array(types.length);

  for (let i = 0; i < types.length; i++) {
    cumulative += getData(types[i]).weight;
    entries[i] = { type: types[i], cumulativeWeight: cumulative };
  }

  return { entries: Object.freeze(entries), totalWeight: cumulative };
}

const CRIME_WEIGHTS = buildCumulativeWeights(CRIME_TYPES, (t) => CRIME_DATA[t]);

// Binary search for weighted random selection - O(log n) instead of O(n)
function binarySearchWeight<T>(
  entries: readonly WeightedEntry<T>[],
  target: number
): T {
  let low = 0;
  let high = entries.length - 1;

  while (low < high) {
    const mid = (low + high) >>> 1; // Bitwise floor division
    if (entries[mid].cumulativeWeight < target) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return entries[low].type;
}

// Get a weighted random crime type - O(log n) via binary search
export function getRandomCrimeType(): CrimeType {
  const random = Math.random() * CRIME_WEIGHTS.totalWeight;
  return binarySearchWeight(CRIME_WEIGHTS.entries, random);
}

// ============================================================================
// FIRE TYPES
// ============================================================================

export const FIRE_TYPES = [
  'structural',
  'electrical',
  'kitchen',
  'industrial',
  'chemical',
  'vehicle',
  'brush',
  'explosion',
  'gas_leak',
  'arson',
] as const;

export type FireType = (typeof FIRE_TYPES)[number];

export interface FireData {
  readonly name: string;
  readonly description: string;
  readonly severity: FireSeverity;
  readonly weight: number; // For weighted random selection
}

const FIRE_DATA_INTERNAL: Record<FireType, FireData> = {
  structural: {
    name: 'Structure Fire',
    description:
      'Flames spreading through building. Multiple floors at risk. Evacuate immediately.',
    severity: 'major',
    weight: 25,
  },
  electrical: {
    name: 'Electrical Fire',
    description:
      'Electrical system overload. Smoke billowing from outlets. Power lines sparking.',
    severity: 'moderate',
    weight: 20,
  },
  kitchen: {
    name: 'Kitchen Fire',
    description:
      'Cooking fire out of control. Grease flames spreading rapidly. Ventilation compromised.',
    severity: 'moderate',
    weight: 15,
  },
  industrial: {
    name: 'Industrial Fire',
    description:
      'Factory blaze with heavy smoke. Hazardous materials may be involved. Wide perimeter needed.',
    severity: 'catastrophic',
    weight: 8,
  },
  chemical: {
    name: 'Chemical Fire',
    description:
      'Toxic chemical combustion. Dangerous fumes spreading. Specialized response required.',
    severity: 'catastrophic',
    weight: 3,
  },
  vehicle: {
    name: 'Vehicle Fire',
    description: 'Car engulfed in flames. Risk of fuel tank explosion. Keep clear.',
    severity: 'minor',
    weight: 10,
  },
  brush: {
    name: 'Brush Fire',
    description: 'Vegetation fire spreading with wind. Nearby structures threatened.',
    severity: 'moderate',
    weight: 5,
  },
  explosion: {
    name: 'Explosion',
    description:
      'Building rocked by blast. Structural integrity compromised. Possible casualties.',
    severity: 'catastrophic',
    weight: 2,
  },
  gas_leak: {
    name: 'Gas Fire',
    description: 'Natural gas ignited. Continuous flame from leak. Shut-off valve needed.',
    severity: 'major',
    weight: 7,
  },
  arson: {
    name: 'Arson Fire',
    description: 'Deliberately set fire detected. Accelerant used. Fire spreading rapidly.',
    severity: 'major',
    weight: 5,
  },
};

// Freeze the fire data for immutability
export const FIRE_DATA: Readonly<Record<FireType, FireData>> =
  Object.freeze(FIRE_DATA_INTERNAL);

// Pre-compute fire weights for O(log n) random selection
const FIRE_WEIGHTS = buildCumulativeWeights(FIRE_TYPES, (t) => FIRE_DATA[t]);

// Get a weighted random fire type - O(log n) via binary search
export function getRandomFireType(): FireType {
  const random = Math.random() * FIRE_WEIGHTS.totalWeight;
  return binarySearchWeight(FIRE_WEIGHTS.entries, random);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function getCrimeName(crimeType: CrimeType): string {
  return CRIME_DATA[crimeType]?.name || 'Unknown Incident';
}

export function getCrimeDescription(crimeType: CrimeType): string {
  return CRIME_DATA[crimeType]?.description || 'Incident reported.';
}

export function getCrimeDuration(crimeType: CrimeType): number {
  return CRIME_DATA[crimeType]?.duration || 20;
}

export function getFireName(fireType: FireType): string {
  return FIRE_DATA[fireType]?.name || 'Fire';
}

export function getFireDescription(fireType: FireType): string {
  return FIRE_DATA[fireType]?.description || 'Building on fire. Fire trucks responding.';
}

// Get fire description based on tile coordinates (deterministic)
export function getFireDescriptionForTile(x: number, y: number): string {
  // Use coordinates to deterministically pick a fire type
  const index = Math.abs((x * 31 + y * 17) % FIRE_TYPES.length);
  return FIRE_DATA[FIRE_TYPES[index]].description;
}

// Get fire name based on tile coordinates (deterministic)
export function getFireNameForTile(x: number, y: number): string {
  const index = Math.abs((x * 31 + y * 17) % FIRE_TYPES.length);
  return FIRE_DATA[FIRE_TYPES[index]].name;
}
