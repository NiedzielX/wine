import type { Meta, StoryObj } from '@storybook/react-vite';
import { Progress } from '../components/progress';

const meta = {
  title: 'Komponenty/Progress',
  component: Progress,
  tags: ['autodocs'],
  args: { value: 40, 'aria-label': 'Uzupełnienie profilu wina' },
  parameters: {
    docs: {
      description: {
        component: `Pasek postępu (shadcn/ui, Radix). Lokalna poprawka: \`value\` jest przekazany do \`Root\`, więc czytnik ogłasza \`aria-valuenow\`, a nie „indeterminate” (patrz \`packages/ui/AGENTS.md\`).

**Kiedy używać:** znany postęp zadania o znanej liczbie kroków (import, uzupełnienie profilu).

**Kiedy nie używać:** gdy nie znasz postępu (użyj \`LoadingMessage\` albo \`Skeleton\`); jako wskaźnik wyniku (np. Match Score) – to nie jest postęp.

Pasek wymaga nazwy (\`aria-label\` albo tekst obok).

**Stany**
- domyślny – wypełnienie \`primary\` na tle \`primary/20\`;
- hover / focus – nie dotyczy (element nie jest interaktywny);
- disabled – nie dotyczy;
- błąd – nie ma stanu błędu: przy błędzie pokaż \`Alert\` obok paska; pusty (0%) – pasek zostaje, widoczny jako pusty.`
      }
    }
  }
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: { value: 0, 'aria-label': 'Import: nic jeszcze nie wgrano' }
};

export const Complete: Story = {
  args: { value: 100, 'aria-label': 'Import zakończony' }
};
