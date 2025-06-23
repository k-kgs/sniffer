import posthog from 'posthog-js';

export function initPostHog() {
//   if (typeof window !== 'undefined' && !posthog.__initialized) {
//     posthog.init(
//       process.env.PTK as string,
//       {
//         api_host: process.env.PTH,
//         loaded: (ph) => { ph.__initialized = true; }
//       }
//     );
//   }
if (typeof window !== 'undefined' && !posthog.__loaded) {
    posthog.init(
      process.env.PTK as string,
      {
        api_host: process.env.PTH || 'https://app.posthog.com',
        loaded: (ph) => { console.log("Posthog Loaded") }
      }
    );
  }  
}

export default posthog;
