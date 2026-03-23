class DemSource {
  constructor(_opts: any) {}
  setupMaplibre(_gl: any) {}
  contourProtocolUrl(_opts: any) {
    return 'contour://{z}/{x}/{y}';
  }
}

export default { DemSource };
