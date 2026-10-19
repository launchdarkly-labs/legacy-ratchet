import { CliError, errorMessage } from './errors.js';

const DASHBOARD_MODULE: string = '@legacy-ratchet/dashboard';

interface DashboardModule {
  renderHtml(snapshot: unknown, template?: string): string;
}

export async function renderDashboard(snapshot: unknown, template?: string): Promise<string> {
  let mod: DashboardModule;
  try {
    mod = (await import(DASHBOARD_MODULE)) as DashboardModule;
  } catch (err) {
    throw new CliError(`Could not load @legacy-ratchet/dashboard: ${errorMessage(err)}`);
  }
  try {
    return mod.renderHtml(snapshot, template);
  } catch (err) {
    const missing = typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'ENOENT';
    throw new CliError(
      missing
        ? 'The dashboard template is missing; build @legacy-ratchet/dashboard (pnpm --filter @legacy-ratchet/dashboard build)'
        : `Could not render the HTML report: ${errorMessage(err)}`,
    );
  }
}
