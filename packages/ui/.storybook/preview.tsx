import type { Preview } from '@storybook/react-vite';
import { useEffect, type ReactNode } from 'react';
import '../src/styles.css';

/** Wraps every story in the dashboard theme. `dark` puts the `.dark` tokens of src/styles.css on html and on the frame. */
function ThemeFrame({ dark, children }: { dark: boolean; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
  return (
    <div className={dark ? 'dark' : undefined}>
      <div className="min-h-full bg-background p-6 font-sans text-foreground">{children}</div>
    </div>
  );
}

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Motyw panelu (tokeny z src/styles.css)',
      defaultValue: 'light',
      toolbar: {
        title: 'Motyw',
        icon: 'mirror',
        dynamicTitle: true,
        items: [
          { value: 'light', title: 'Jasny' },
          { value: 'dark', title: 'Ciemny' }
        ]
      }
    }
  },
  decorators: [
    (Story, context) => (
      <ThemeFrame dark={context.globals.theme === 'dark'}>
        <Story />
      </ThemeFrame>
    )
  ],
  parameters: {
    layout: 'fullscreen',
    controls: { expanded: true }
  }
};

export default preview;
