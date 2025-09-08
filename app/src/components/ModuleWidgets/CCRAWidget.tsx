import React, { useState, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { riskLevels, ccraTranslations, formatScore, getRiskLevel, getRiskChangeDescription } from '@/util/ccra-constants';
import { CCRARiskAssessment } from '@/util/types';

interface TopRisksWidgetProps {
  cityId: string;
  cityName?: string;
  riskAssessment: CCRARiskAssessment[];
  resilienceScore?: number | null;
  className?: string;
}

const TopRisksWidget: React.FC<TopRisksWidgetProps> = ({
  cityId,
  cityName = 'Your City',
  riskAssessment,
  resilienceScore = null,
  className = ''
}) => {
  // Calculate top 3 risks
  const topRisks = useMemo(() => {
    if (!riskAssessment || riskAssessment.length === 0) return [];
    
    return [...riskAssessment]
      .sort((a, b) => {
        const scoreA = a.risk_score ?? 0;
        const scoreB = b.risk_score ?? 0;
        return scoreB - scoreA;
      })
      .slice(0, 3);
  }, [riskAssessment]);

  // Helper function to get translated text
  const getTranslation = (type: 'hazard' | 'sector', key: string, fallback: string) => {
    if (type === 'hazard') {
      return ccraTranslations.hazards[key as keyof typeof ccraTranslations.hazards] || fallback;
    }
    if (type === 'sector') {
      return ccraTranslations.sectors[key as keyof typeof ccraTranslations.sectors] || fallback;
    }
    return fallback;
  };

  const getImpactDescription = (hazardKey: string, sectorKey: string) => {
    const hazardImpacts = ccraTranslations.impacts[hazardKey as keyof typeof ccraTranslations.impacts];
    if (hazardImpacts && typeof hazardImpacts === 'object' && sectorKey in hazardImpacts) {
      return (hazardImpacts as any)[sectorKey];
    }
    if (hazardImpacts && typeof hazardImpacts === 'object' && 'general' in hazardImpacts) {
      return (hazardImpacts as any).general;
    }
    return ccraTranslations.impacts.general.default;
  };

  if (topRisks.length === 0) {
    return (
      <div className={`bg-white rounded-2xl shadow-sm p-6 ${className}`}>
        <div className="text-center py-8 text-gray-500">
          No risk data available for {cityName}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-2xl shadow-sm p-6 ${className}`}>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">
          Top Climate Risks
        </h2>
        <p className="text-gray-600">
          The three highest climate risks identified for {cityName} based on hazard, exposure, and vulnerability assessments.
        </p>
      </div>

      {/* Risk Cards */}
      <div className="flex flex-col lg:flex-row gap-4">
        {topRisks.map((risk, index) => {
          const riskLevel = getRiskLevel(risk.risk_score);
          const changeDescription = resilienceScore !== null 
            ? getRiskChangeDescription(risk.original_risk_score, risk.risk_score) 
            : null;
          
          const hazardKey = risk.hazard?.toLowerCase().replace(/\s+/g, '_');
          const sectorKey = risk.keyimpact?.toLowerCase().replace(/\s+/g, '_');

          return (
            <div 
              key={`${risk.hazard}-${risk.keyimpact}-${index}`}
              className="flex-1 p-6 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
            >
              {/* Sector and Risk Level Badge */}
              <div className="flex items-center justify-between mb-4">
                <div className="uppercase text-gray-600 text-xs font-semibold tracking-wider">
                  {getTranslation('sector', sectorKey, risk.keyimpact)}
                </div>
                <span
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: riskLevel.backgroundColor,
                    color: riskLevel.textColor
                  }}
                >
                  {riskLevel.label}
                </span>
              </div>

              {/* Hazard Name */}
              <div className="mb-6">
                <h4 className="text-2xl font-semibold capitalize text-gray-900">
                  {getTranslation('hazard', hazardKey, risk.hazard)}
                </h4>
                <span className="text-gray-500 text-sm">
                  Climate Hazard
                </span>
              </div>

              {/* Risk Score */}
              <div className="space-y-4">
                <div className="flex justify-between items-baseline">
                  <span className="text-gray-600 text-sm font-medium">
                    Risk Score
                  </span>
                  <div className="flex items-baseline gap-2">
                    {resilienceScore !== null && (
                      <span className="text-gray-500 text-sm line-through">
                        {formatScore(risk.original_risk_score)}
                      </span>
                    )}
                    <span className="text-3xl font-bold" style={{ color: riskLevel.color }}>
                      {formatScore(risk.risk_score)}
                    </span>
                  </div>
                </div>

                {changeDescription && (
                  <div className="text-sm text-right" style={{ color: changeDescription.color }}>
                    {changeDescription.text}
                  </div>
                )}

                {/* Progress bars */}
                <div className="flex gap-1">
                  {[...Array(5)].map((_, i) => {
                    const thresholds = [0.01, 0.078, 0.165, 0.289, 0.508];
                    const isActive = risk.risk_score >= thresholds[i];

                    return (
                      <div
                        key={i}
                        className={`h-1.5 flex-1 rounded-full transition-colors ${
                          isActive ? 'bg-current' : 'bg-gray-200'
                        }`}
                        style={{ color: isActive ? riskLevel.color : undefined }}
                      />
                    );
                  })}
                </div>

                {/* Component Scores */}
                <div className="space-y-3 pt-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Hazard Score</span>
                    <span className="font-medium text-gray-900">
                      {formatScore(risk.hazard_score)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Exposure Score</span>
                    <span className="font-medium text-gray-900">
                      {formatScore(risk.exposure_score)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Vulnerability Score</span>
                    <div className="flex items-baseline gap-2">
                      {resilienceScore !== null && (
                        <span className="text-gray-500 text-xs line-through">
                          {formatScore(risk.original_vulnerability_score)}
                        </span>
                      )}
                      <span className={`font-medium ${
                        resilienceScore !== null ? 'text-blue-600' : 'text-gray-900'
                      }`}>
                        {formatScore(risk.vulnerability_score)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Human impact explanation */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <h5 className="text-sm font-medium text-gray-700 mb-2">
                  Potential Impacts
                </h5>
                <p className="text-sm text-gray-600">
                  {getImpactDescription(hazardKey, sectorKey)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TopRisksWidget;