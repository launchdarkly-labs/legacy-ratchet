import { CliError, errorMessage } from './errors.js';

const DASHBOARD_MODULE: string = '@migration-tracker/dashboard';

interface DashboardModule {
  renderHtml(snapshot: unknown, template?: string): string;
}

export async function renderDashboard(snapshot: unknown, template?: string): Promise<string> {
  let mod: DashboardModule;
  try {
    mod = (await import(DASHBOARD_MODULE)) as DashboardModule;
  } catch (err) {
    throw new CliError(`Could not load @migration-tracker/dashboard: ${errorMessage(err)}`);
  }
  try {
    return mod.renderHtml(snapshot, template);
  } catch (err) {
    const missing = typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'ENOENT';
    throw new CliError(
      missing
        ? 'The dashboard template is missing; build @migration-tracker/dashboard (pnpm --filter @migration-tracker/dashboard build)'
        : `Could not render the HTML report: ${errorMessage(err)}`,
    );
  }
}
