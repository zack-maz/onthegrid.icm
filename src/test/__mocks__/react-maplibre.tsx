/**
 * Mock for @vis.gl/react-maplibre in jsdom tests.
 * Provides stub components and hooks so MapLibre-dependent tests run without WebGL.
 */
import React from 'react';

// Store callbacks for tests to access
export let __capturedOnLoad: ((e: unknown) => void) | undefined;
export let __capturedOnMouseMove: ((e: unknown) => void) | undefined;

export function Map({
  children,
  onLoad,
  onMouseMove,
}: {
  children?: React.ReactNode;
  onLoad?: (e: unknown) => void;
  onMouseMove?: (e: unknown) => void;
  [key: string]: unknown;
}) {
  __capturedOnLoad = onLoad;
  __capturedOnMouseMove = onMouseMove;
  return <div data-testid="mock-map">{children}</div>;
}

export function Source() {
  return null;
}

export function Layer() {
  return null;
}

export function NavigationControl() {
  return null;
}

export function ScaleControl() {
  return null;
}

export function useControl<T>(_factory: () => T): T {
  return _factory();
}

export function useMap() {
  return { current: null };
}
