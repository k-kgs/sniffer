import posthog from 'posthog-js';

export function initPostHog() {
  if (typeof window !== 'undefined' && !posthog.__initialized) {
    posthog.init(
      process.env.PTK as string,
      {
        api_host: process.env.PTH,
        loaded: (ph) => { ph.__initialized = true; }
      }
    );
  }
}

export default posthog;
