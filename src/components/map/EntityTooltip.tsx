import { useRef, useLayoutEffect, useState } from 'react';
import type {
  MapEntity,
  FlightEntity,
  ShipEntity,
  ConflictEventEntity,
  SiteEntity,
} from '@/types/entities';
import { isConflictEventType, EVENT_TYPE_LABELS, SITE_TYPE_LABELS } from '@/types/ui';
import { useEventStore } from '@/stores/eventStore';
import { useFilterStore } from '@/stores/filterStore';
import { computeAttackStatus } from '@/lib/attackStatus';

interface EntityTooltipProps {
  entity: MapEntity | SiteEntity;
  x: number;
  y: number;
}

const MARGIN = 8;

function FlightContent({ entity }: { entity: FlightEntity }) {
  const d = entity.data;
  const alt = d.altitude != null ? `${Math.round(d.altitude)}m` : '--';
  const speed = d.velocity != null ? `${Math.round(d.velocity)}m/s` : '--';
  const heading = d.heading != null ? `${Math.round(d.heading)}deg` : '--';

  return (
    <>
      <span
        style={{
          color: '#9ca3af',
          textTransform: 'uppercase',
          fontSize: '9px',
          letterSpacing: '0.05em',
        }}
      >
        Flight
      </span>
      <br />
      <strong>{d.callsign || d.icao24}</strong>
      {d.callsign && (
        <>
          <br />
          ICAO: {d.icao24}
        </>
      )}
      <br />
      Origin: {d.originCountry || '--'}
      <br />
      Altitude: {alt}
      <br />
      Speed: {speed}
      <br />
      Heading: {heading}
      <br />
      Status: {d.onGround ? 'Ground' : 'Airborne'}
      {d.unidentified && (
        <>
          <br />
          <span style={{ color: '#ef4444' }}>Unidentified</span>
        </>
      )}
    </>
  );
}

function ShipContent({ entity }: { entity: ShipEntity }) {
  const d = entity.data;
  return (
    <>
      <span
        style={{
          color: '#9ca3af',
          textTransform: 'uppercase',
          fontSize: '9px',
          letterSpacing: '0.05em',
        }}
      >
        Ship
      </span>
      <br />
      <strong>{d.shipName || `MMSI ${d.mmsi}`}</strong>
      {d.shipName && (
        <>
          <br />
          MMSI: {d.mmsi}
        </>
      )}
      <br />
      Speed: {d.speedOverGround.toFixed(1)} kn
      <br />
      Course: {Math.round(d.courseOverGround)}°
      <br />
      Heading: {Math.round(d.trueHeading)}°
    </>
  );
}

/** Precision indicator dot color coding */
const PRECISION_DOT_STYLES: Record<string, string> = {
  exact: '#22c55e', // green
  neighborhood: '#eab308', // yellow
  city: '#f97316', // orange
  region: '#ef4444', // red
};

function EventContent({ entity }: { entity: ConflictEventEntity }) {
  const d = entity.data;
  const date = new Date(entity.timestamp).toISOString().slice(0, 10);

  return (
    <>
      <span
        style={{
          color: '#9ca3af',
          textTransform: 'uppercase',
          fontSize: '9px',
          letterSpacing: '0.05em',
        }}
      >
        {EVENT_TYPE_LABELS[entity.type] ?? entity.type}
      </span>
      <br />
      <strong>{d.eventType || 'Unknown'}</strong>
      {d.locationName && (
        <>
          <br />
          Location: {d.locationName}
        </>
      )}
      {d.precision && (
        <>
          <br />
          <span
            style={{
              display: 'inline-block',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: PRECISION_DOT_STYLES[d.precision] ?? '#9ca3af',
              marginRight: '4px',
              verticalAlign: 'middle',
            }}
          />
          <span style={{ fontSize: '10px', verticalAlign: 'middle' }}>
            {d.precision === 'exact'
              ? 'Precise'
              : d.precision === 'neighborhood'
                ? '~1km'
                : d.precision === 'city'
                  ? '~5km'
                  : '~25km'}
          </span>
        </>
      )}
      {d.actor1 && (
        <>
          <br />
          Actor 1: {d.actor1}
        </>
      )}
      {d.actor2 && (
        <>
          <br />
          Actor 2: {d.actor2}
        </>
      )}
      <br />
      Date: {date}
      {d.cameoCode && (
        <>
          <br />
          CAMEO: {d.cameoCode}
        </>
      )}
    </>
  );
}

function SiteContent({ entity }: { entity: SiteEntity }) {
  const events = useEventStore((s) => s.events);
  const dateEnd = useFilterStore((s) => s.dateEnd);
  const attack = computeAttackStatus(entity, events, dateEnd);
  const typeLabel = SITE_TYPE_LABELS[entity.siteType] ?? entity.siteType;

  return (
    <>
      <span
        style={{
          color: '#9ca3af',
          textTransform: 'uppercase',
          fontSize: '9px',
          letterSpacing: '0.05em',
        }}
      >
        {typeLabel}
      </span>
      <br />
      <strong>{entity.label}</strong>
      {entity.operator && (
        <>
          <br />
          Operator: {entity.operator}
        </>
      )}
      <br />
      Status:{' '}
      <span style={{ color: attack.isAttacked ? '#f97316' : '#22c55e' }}>
        {attack.isAttacked ? `Attacked (${attack.attackCount} events)` : 'Healthy'}
      </span>
      {attack.latestAttackDate && (
        <>
          <br />
          Last attack: {new Date(attack.latestAttackDate).toISOString().slice(0, 10)}
        </>
      )}
    </>
  );
}

export function EntityTooltip({ entity, x, y }: EntityTooltipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x + 12, top: y + 12 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = x + 12;
    let top = y + 12;

    if (left + rect.width > vw - MARGIN) {
      left = x - rect.width - 12;
    }
    if (left < MARGIN) left = MARGIN;

    if (top + rect.height > vh - MARGIN) {
      top = y - rect.height - 12;
    }
    if (top < MARGIN) top = MARGIN;

    setPos({ left, top });
  }, [x, y]);

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        backgroundColor: 'rgba(30,30,30,0.96)',
        color: '#e5e5e5',
        borderRadius: '6px',
        padding: '8px 12px',
        border: '1px solid rgba(255,255,255,0.2)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        maxWidth: '300px',
        backdropFilter: 'blur(8px)',
        fontFamily: 'monospace',
        fontSize: '11px',
        lineHeight: 1.5,
        pointerEvents: 'auto',
        zIndex: 'var(--z-tooltip)' as unknown as number,
      }}
    >
      {entity.type === 'flight' && <FlightContent entity={entity as FlightEntity} />}
      {entity.type === 'ship' && <ShipContent entity={entity as ShipEntity} />}
      {isConflictEventType(entity.type) && <EventContent entity={entity as ConflictEventEntity} />}
      {entity.type === 'site' && <SiteContent entity={entity as SiteEntity} />}
    </div>
  );
}
