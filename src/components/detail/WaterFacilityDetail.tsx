import { useState } from 'react';
import type { WaterFacility } from '../../../server/types';
import { stressToRGBA, bwsScoreToLabel, healthToScore, scoreToLabel } from '@/lib/waterStress';
import { useEventStore } from '@/stores/eventStore';
import { useFilterStore } from '@/stores/filterStore';
import { useUIStore } from '@/stores/uiStore';
import { getCurrentPanelView } from '@/lib/panelLabel';
import { useSiteImage } from '@/hooks/useSiteImage';
import { DetailValue } from './DetailValue';
import { EVENT_TYPE_LABELS } from '@/types/ui';
import type { ConflictEventEntity } from '@/types/entities';

/** Human-readable labels for water facility types */
const WATER_TYPE_LABELS: Record<string, string> = {
  dam: 'Dam',
  reservoir: 'Reservoir',
  desalination: 'Desalination Plant',
  treatment_plant: 'Treatment Plant',
};

interface WaterFacilityDetailProps {
  facility: WaterFacility;
}

const ATTACK_RADIUS_KM = 5;
const COARSE_DEG = 0.05;
const MAX_VISIBLE_ATTACKS = 5;

function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeWaterAttackStatus(facility: WaterFacility, events: ConflictEventEntity[], dateEnd: number) {
  const attacks = events.filter((e) => {
    if (e.timestamp > dateEnd) return false;
    if (Math.abs(e.lat - facility.lat) > COARSE_DEG || Math.abs(e.lng - facility.lng) > COARSE_DEG) return false;
    return haversineDistanceKm(facility.lat, facility.lng, e.lat, e.lng) <= ATTACK_RADIUS_KM;
  });
  return {
    isAttacked: attacks.length > 0,
    attackCount: attacks.length,
    attacks: attacks.sort((a, b) => b.timestamp - a.timestamp),
  };
}

function scoreLabel(score: number): string {
  return score >= 0 ? `${score.toFixed(1)}/5` : 'N/A';
}

export function WaterFacilityDetail({ facility }: WaterFacilityDetailProps) {
  const events = useEventStore((s) => s.events);
  const dateEnd = useFilterStore((s) => s.dateEnd);
  const selectEntity = useUIStore((s) => s.selectEntity);
  const openDetailPanel = useUIStore((s) => s.openDetailPanel);

  const attack = computeWaterAttackStatus(facility, events, dateEnd);
  const typeLabel = WATER_TYPE_LABELS[facility.facilityType] ?? facility.facilityType;
  const osmUrl = `https://www.openstreetmap.org/?mlat=${facility.lat}&mlon=${facility.lng}#map=15/${facility.lat}/${facility.lng}`;
  const imageUrl = useSiteImage(facility.lat, facility.lng);

  const score = healthToScore(facility.stress.compositeHealth);
  const scorePct = Math.round((score / 10) * 100);
  const [r, g, b] = stressToRGBA(facility.stress.compositeHealth, 255);
  const stressColor = `rgb(${r}, ${g}, ${b})`;

  const [showAll, setShowAll] = useState(false);
  const [imgError, setImgError] = useState(false);
  const visibleAttacks = showAll ? attack.attacks : attack.attacks.slice(0, MAX_VISIBLE_ATTACKS);

  // Precipitation relative timestamp
  const precipAge = facility.precipitation
    ? Math.floor((Date.now() - facility.precipitation.updatedAt) / 1000)
    : null;

  return (
    <div className="flex flex-col gap-1">
      {/* Satellite thumbnail */}
      {imageUrl && !imgError && (
        <div className="relative -mx-3 -mt-1 mb-2 overflow-hidden rounded-b-lg">
          <img
            src={imageUrl}
            alt={facility.label}
            onError={() => setImgError(true)}
            className="h-36 w-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[var(--color-surface-overlay)] to-transparent" />
        </div>
      )}

      {/* Facility Info */}
      <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1 mt-0">
        Facility Info
      </h3>
      <DetailValue label="Type" value={typeLabel} />
      <DetailValue label="Operator" value={facility.operator || 'Unknown'} />
      <DetailValue label="OSM ID" value={String(facility.osmId)} />

      {/* Water Stress */}
      <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1 mt-3">
        Water Stress
      </h3>
      <div className="flex items-center justify-between px-3 py-1">
        <span className="text-[10px] uppercase tracking-wider text-text-muted">
          BWS Level
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: stressColor }}
          />
          <span className="tabular-nums text-text-primary">
            {bwsScoreToLabel(facility.stress.bws_score)} ({facility.stress.bws_score.toFixed(1)}/5)
          </span>
        </div>
      </div>

      {/* Composite Health */}
      <div className="flex items-center justify-between px-3 py-1">
        <span className="text-[10px] uppercase tracking-wider text-text-muted">
          Health
        </span>
        <div className="flex items-center gap-2">
          <div className="relative h-2 w-16 rounded-full bg-white/10 overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${scorePct}%`,
                backgroundColor: stressColor,
              }}
            />
          </div>
          <span className="tabular-nums text-text-primary text-xs">{score}/10 {scoreToLabel(score)}</span>
        </div>
      </div>

      {/* Aqueduct Indicators */}
      <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1 mt-3">
        Aqueduct Indicators
      </h3>
      <DetailValue label="Drought Risk" value={scoreLabel(facility.stress.drr_score)} />
      <DetailValue label="Groundwater" value={scoreLabel(facility.stress.gtd_score)} />
      <DetailValue label="Seasonal Var." value={scoreLabel(facility.stress.sev_score)} />
      <DetailValue label="Interannual Var." value={scoreLabel(facility.stress.iav_score)} />

      {/* Precipitation */}
      {facility.precipitation && (
        <>
          <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1 mt-3">
            Precipitation
          </h3>
          <DetailValue
            label="30-Day Total"
            value={`${facility.precipitation.last30DaysMm.toFixed(0)} mm`}
          />
          <DetailValue
            label="Anomaly"
            value={`${Math.round(facility.precipitation.anomalyRatio * 100)}% of normal`}
          />
          {precipAge !== null && (
            <div className="px-3 py-1">
              <span className="text-[10px] text-text-muted">
                Updated {precipAge}s ago
              </span>
            </div>
          )}
        </>
      )}

      {/* Attack Status */}
      {attack.isAttacked && (
        <>
          <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1 mt-3">
            Attack History
          </h3>
          <div className="px-3 py-1">
            <span className="text-xs text-red-400 font-semibold">
              {attack.attackCount} conflict event{attack.attackCount !== 1 ? 's' : ''} within {ATTACK_RADIUS_KM}km
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {visibleAttacks.map((evt) => {
              const date = new Date(evt.timestamp).toISOString().slice(0, 10);
              const evtLabel = EVENT_TYPE_LABELS[evt.type] ?? evt.type;
              return (
                <button
                  key={evt.id}
                  onClick={() => {
                    const currentView = getCurrentPanelView();
                    if (currentView) {
                      useUIStore.getState().pushView(currentView);
                    }
                    selectEntity(evt.id);
                    openDetailPanel();
                  }}
                  className="flex items-center justify-between px-3 py-1 text-xs hover:bg-white/5 rounded transition-colors text-left"
                >
                  <span className="text-text-secondary">{date}</span>
                  <span className="text-text-primary">{evtLabel}</span>
                  {evt.data.actor1 && (
                    <span className="text-text-muted truncate max-w-[100px]">{evt.data.actor1}</span>
                  )}
                </button>
              );
            })}
          </div>
          {attack.attackCount > MAX_VISIBLE_ATTACKS && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="px-3 py-1 text-[10px] text-accent hover:underline"
            >
              Show all ({attack.attackCount})
            </button>
          )}
        </>
      )}

      {/* Location */}
      <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1 mt-3">
        Location
      </h3>
      <DetailValue label="Latitude" value={facility.lat.toFixed(6)} />
      <DetailValue label="Longitude" value={facility.lng.toFixed(6)} />
      <div className="flex items-center justify-between px-3 py-1">
        <span className="text-[10px] uppercase tracking-wider text-text-muted">
          Map
        </span>
        <a
          href={osmUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-accent hover:underline"
        >
          View on OpenStreetMap
        </a>
      </div>

      {/* Source */}
      <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1 mt-3">
        Source
      </h3>
      <DetailValue label="Data Source" value="OpenStreetMap" />
      <DetailValue label="Stress Data" value="WRI Aqueduct 4.0" />
    </div>
  );
}
