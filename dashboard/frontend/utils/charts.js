// Reusable lightweight SVG Area/Line Charting engine for HomeLab OS

export function generateSvgChart(dataPoints, width = 400, height = 80, strokeColor = '#3b82f6', fillColor = 'rgba(59, 130, 246, 0.08)') {
  if (!Array.isArray(dataPoints) || dataPoints.length < 2) {
    return `<svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: ${height}px;"><text x="10" y="40" fill="var(--text-muted)" font-size="12">No telemetry history data available</text></svg>`;
  }

  const maxVal = Math.max(...dataPoints, 100); // Scale up to 100% capacity
  const minVal = 0;
  const range = maxVal - minVal;

  const points = dataPoints.map((val, idx) => {
    const x = (idx / (dataPoints.length - 1)) * width;
    // Invert Y axis for SVG rendering coordinates mapping
    const y = height - ((val - minVal) / range) * (height - 8) - 4;
    return { x, y };
  });

  // Build SVG path strings
  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    pathD += ` L ${points[i].x} ${points[i].y}`;
  }

  // Build filled area path strings
  const areaD = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

  return `
    <svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: ${height}px; display: block; overflow: visible;">
      <defs>
        <linearGradient id="chart-grad-${strokeColor.replace('#','')}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
      <!-- Area Fill -->
      <path d="${areaD}" fill="url(#chart-grad-${strokeColor.replace('#','')})" />
      <!-- Line Stroke -->
      <path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;
}
export default generateSvgChart;
