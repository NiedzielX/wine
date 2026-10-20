import type { StorybookConfig } from '@storybook/react-vite';
import tailwindcss from '@tailwindcss/vite';

/**
 * Storybook for the shared UI (packages/ui). Not part of the application build: `npm run build` at the root never
 * touches it; use `npm run storybook` (dev) or `npm run storybook:build` (static output in storybook-static/).
 * Stories live in src/stories, so `tsc` and the package boundaries cover them.
 */
const config: StorybookConfig = {
  stories: ['../src/stories/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs'],
  framework: { name: '@storybook/react-vite', options: {} },
  viteFinal: async (viteConfig) => {
    // The panel theme is Tailwind v4 (src/styles.css with @import "tailwindcss"); Storybook's Vite needs the plugin.
    viteConfig.plugins = [...(viteConfig.plugins ?? []), tailwindcss()];
    return viteConfig;
  }
};

export default config;
