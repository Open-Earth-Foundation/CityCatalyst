// Risk level configurations for CCRA
export const riskLevels = {
  VERY_LOW: {
    label: 'Very Low',
    color: '#02C650',
    backgroundColor: '#DCFCE7',
    textColor: '#166534'
  },
  LOW: {
    label: 'Low',
    color: '#A9DE00',
    backgroundColor: '#ECFCCB',
    textColor: '#3F6212'
  },
  MEDIUM: {
    label: 'Medium',
    color: '#FFCD00',
    backgroundColor: '#FEF9C3',
    textColor: '#854D0E'
  },
  HIGH: {
    label: 'High',
    color: '#FF8300',
    backgroundColor: '#FEE2E2',
    textColor: '#991B1B'
  },
  VERY_HIGH: {
    label: 'Very High',
    color: '#F40000',
    backgroundColor: '#FFE4E6',
    textColor: '#9F1239'
  },
  NA: {
    label: 'N/A',
    color: '#6B7280',
    backgroundColor: '#F3F4F6',
    textColor: '#374151'
  }
};

// Translation mappings for CCRA hazards and sectors
export const ccraTranslations = {
  hazards: {
    'extreme_heat': 'Extreme Heat',
    'flooding': 'Flooding',
    'drought': 'Drought',
    'wildfire': 'Wildfire',
    'cyclone': 'Cyclone',
    'sea_level_rise': 'Sea Level Rise'
  },
  sectors: {
    'health': 'Health',
    'infrastructure': 'Infrastructure',
    'economy': 'Economy',
    'environment': 'Environment',
    'agriculture': 'Agriculture',
    'water': 'Water Resources'
  },
  impacts: {
    'extreme_heat': {
      'health': 'Increased heat-related illnesses, cardiovascular stress, and mortality rates, particularly affecting elderly and vulnerable populations.',
      'infrastructure': 'Accelerated deterioration of roads and buildings, increased cooling demands straining power grids.',
      'general': 'Rising temperatures can cause widespread disruptions to daily life and economic activities.'
    },
    'flooding': {
      'health': 'Water-borne diseases, injuries, mental health impacts from displacement and property loss.',
      'infrastructure': 'Damage to roads, bridges, buildings, and utilities. Disruption of transportation and essential services.',
      'general': 'Flooding can cause immediate danger to life and long-term economic impacts.'
    },
    'general': {
      'default': 'This hazard poses significant risks to the affected sector, requiring targeted adaptation measures.'
    }
  }
};

// Utility functions
export const formatScore = (score: number | null | undefined): string => {
  if (score === null || score === undefined) return 'N/A';
  return Number(score).toFixed(3);
};

export const getRiskLevel = (score: number | null | undefined) => {
  if (score === null || score === undefined) return riskLevels.NA;
  const numScore = Number(score);
  if (numScore < 0.19) return riskLevels.VERY_LOW;
  if (numScore < 0.39) return riskLevels.LOW;
  if (numScore < 0.59) return riskLevels.MEDIUM;
  if (numScore < 0.79) return riskLevels.HIGH;
  return riskLevels.VERY_HIGH;
};

export const getRiskChangeDescription = (originalScore: number | null, updatedScore: number | null) => {
  if (!originalScore || !updatedScore) return null;
  const percentChange = ((updatedScore - originalScore) / originalScore) * 100;
  if (Math.abs(percentChange) < 1) return null;
  return {
    text: `${percentChange > 0 ? '+' : ''}${percentChange.toFixed(1)}%`,
    color: percentChange > 0 ? '#EF4444' : '#10B981'
  };
};