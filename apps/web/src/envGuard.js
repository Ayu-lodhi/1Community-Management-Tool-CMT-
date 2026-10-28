/**
 * Guard against leaking demo credentials in production.
 * In production builds (import.meta.env.PROD), throws a fatal error and logs
 * if any VITE_DEMO_* variable is set with a non-empty value.
 */
export function guardProductionDemoEnv(env = (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : undefined)) {
  if (!env || !env.PROD) {
    return;
  }

  const demoKeys = [
    env.VITE_DEMO_SUPER_EMAIL && 'VITE_DEMO_SUPER_EMAIL',
    env.VITE_DEMO_SUPER_PASSWORD && 'VITE_DEMO_SUPER_PASSWORD',
    env.VITE_DEMO_ADMIN_EMAIL && 'VITE_DEMO_ADMIN_EMAIL',
    env.VITE_DEMO_ADMIN_PASSWORD && 'VITE_DEMO_ADMIN_PASSWORD',
    env.VITE_DEMO_T3_EMAIL && 'VITE_DEMO_T3_EMAIL',
    env.VITE_DEMO_T3_PASSWORD && 'VITE_DEMO_T3_PASSWORD',
    env.VITE_DEMO_T2_EMAIL && 'VITE_DEMO_T2_EMAIL',
    env.VITE_DEMO_T2_PASSWORD && 'VITE_DEMO_T2_PASSWORD',
    env.VITE_DEMO_T1_EMAIL && 'VITE_DEMO_T1_EMAIL',
    env.VITE_DEMO_T1_PASSWORD && 'VITE_DEMO_T1_PASSWORD',
    ...Object.keys(env).filter(
      (k) => k.startsWith('VITE_DEMO_') && Boolean(typeof env[k] === 'string' ? env[k].trim() : env[k])
    ),
  ].filter(Boolean);

  if (demoKeys.length > 0) {
    const uniqueKeys = [...new Set(demoKeys)];
    const errorMsg = `[SECURITY FATAL] VITE_DEMO_* variables (${uniqueKeys.join(', ')}) must NOT be set in production!`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
}
