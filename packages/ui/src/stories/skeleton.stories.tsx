import type { Meta, StoryObj } from '@storybook/react-vite';
import { Skeleton } from '../components/skeleton';

const meta = {
  title: 'Komponenty/Skeleton',
  component: Skeleton,
  tags: ['autodocs'],
  args: { className: 'h-4 w-48' },
  parameters: {
    docs: {
      description: {
        component: `Szkielet treści podczas ładowania (shadcn/ui): szary blok o kształcie przyszłej treści.

**Kiedy używać:** ładowanie listy lub karty, której kształt znasz; zamiast pustego ekranu, żeby nie „skakał” układ.

**Kiedy nie używać:** gdy nie wiadomo, ile trwa operacja i czy się uda (użyj \`LoadingMessage\` z komunikatem \`role="status"\`); jako dekoracja.

**Stany**
- domyślny – pulsujący blok na tle \`accent\`;
- hover / focus / disabled – nie dotyczy (nie jest interaktywny);
- błąd – nie dotyczy: po błędzie zastąp szkielet komunikatem \`ErrorMessage\`;
- pusty – nie dotyczy: po zakończeniu ładowania pokaż \`EmptyState\`, a nie szkielet.

Szkielet sam nie ogłasza ładowania; komunikat dla czytnika daje \`LoadingMessage\`.`
      }
    }
  }
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CardPlaceholder: Story = {
  render: () => (
    <div className="grid max-w-sm gap-3 rounded-lg border p-4">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  )
};
