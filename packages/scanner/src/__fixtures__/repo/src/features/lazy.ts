export async function loadChart() {
  // legacy-ratchet-disable-next-line charts -- migrating in Q4
  const chart = await import('old-charts');
  return chart;
}
