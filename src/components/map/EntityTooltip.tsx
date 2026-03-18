import { useRef, useLayoutEffect, useState } from 'react';
import type { MapEntity, FlightEntity, ShipEntity, ConflictEventEntity } from '@/types/entities';

interface EntityTooltipProps {
  entity: MapEntity;
  x: number;
  y: number;
}

const MARGIN = 8;

function FlightContent({ entity }: { entity: FlightEntity }) {
  const d = entity.data;
  const alt = d.altitude != null ? `${Math.round(d.altitude)}m` : '—';
  const speed = d.velocity != null ? `${Math.round(d.velocity)}m/s` : '—';
  const heading = d.heading != null ? `${Math.round(d.heading)}°` : '—';
  const vRate = d.verticalRate != null ? `${d.verticalRate > 0 ? '+' : ''}${d.verticalRate.toFixed(1)}m/s` : '—';

  return (
    <>
      <span style={{ color: '#9ca3af', textTransform: 'uppercase', fontSize: '9px', letterSpacing: '0.05em' }}>Flight</span>
      <br /><strong>{d.callsign || d.icao24}</strong>
      {d.callsign && <><br />ICAO: {d.icao24}</>}
      <br />Origin: {d.originCountry || '—'}
      <br />Altitude: {alt}
      <br />Speed: {speed}
      <br />Heading: {heading}
      <br />V/S: {vRate}
      <br />Status: {d.onGround ? 'Ground' : 'Airborne'}
      {d.unidentified && <><br /><span style={{ color: '#ef4444' }}>Unidentified</span></>}
    </>
  );
}

function ShipContent({ entity }: { entity: ShipEntity }) {
  const d = entity.data;
  return (
    <>
      <span style={{ color: '#9ca3af', textTransform: 'uppercase', fontSize: '9px', letterSpacing: '0.05em' }}>Ship</span>
      <br /><strong>{d.shipName || `MMSI ${d.mmsi}`}</strong>
      {d.shipName && <><br />MMSI: {d.mmsi}</>}
      <br />Speed: {d.speedOverGround.toFixed(1)} kn
      <br />Course: {Math.round(d.courseOverGround)}°
      <br />Heading: {Math.round(d.trueHeading)}°
    </>
  );
}

function EventContent({ entity }: { entity: ConflictEventEntity }) {
  const d = entity.data;
  const date = new Date(entity.timestamp).toISOString().slice(0, 10);

  return (
    <>
      <span style={{ color: '#9ca3af', textTransform: 'uppercase', fontSize: '9px', letterSpacing: '0.05em' }}>{entity.type === 'drone' ? 'Drone' : 'Missile'}</span>
      <br /><strong>{d.eventType}</strong>
      {d.locationName && <><br />Location: {d.locationName}</>}
      {d.actor1 && <><br />Actor 1: {d.actor1}</>}
      {d.actor2 && <><br />Actor 2: {d.actor2}</>}
      <br />Date: {date}
      <br />CAMEO: {d.cameoCode}
      <br />Goldstein: {d.goldsteinScale.toFixed(1)}
      {d.source && (
        <>
          <br />
          <a href={d.source} target="_blank" rel="noopener" style={{ color: '#60a5fa' }}>
            Source
          </a>
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
        backgroundColor: 'rgba(0,0,0,0.85)',
        color: '#e5e5e5',
        borderRadius: '6px',
        padding: '8px 12px',
        border: '1px solid rgba(255,255,255,0.1)',
        maxWidth: '300px',
        backdropFilter: 'blur(4px)',
        fontFamily: 'monospace',
        fontSize: '11px',
        lineHeight: 1.5,
        pointerEvents: 'auto',
        zIndex: 1000,
      }}
    >
      {entity.type === 'flight' && <FlightContent entity={entity as FlightEntity} />}
      {entity.type === 'ship' && <ShipContent entity={entity as ShipEntity} />}
      {(entity.type === 'drone' || entity.type === 'missile') && <EventContent entity={entity as ConflictEventEntity} />}
    </div>
  );
}
