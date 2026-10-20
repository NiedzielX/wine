import type { Meta, StoryObj } from '@storybook/react-vite';
import { Separator } from '../components/separator';

const meta = {
  title: 'Komponenty/Separator',
  component: Separator,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: `Linia podziału (shadcn/ui, Radix). Domyślnie \`decorative\`: ukryta przed czytnikiem ekranu.

**Kiedy używać:** oddzielenie sekcji w tej samej karcie lub na liście; pionowy podział w pasku narzędzi.

**Kiedy nie używać:** jako granica pola formularza albo przycisku (to element interaktywny – potrzebuje kontrastu 3:1, a \`border\` jest tylko dekoracją); do przekazania znaczenia, którego nie ma w tekście.

**Stany**
- domyślny – 1 px, kolor \`border\`;
- hover / focus / disabled – nie dotyczy (element nie jest interaktywny);
- błąd / pusty – nie dotyczy.`
      }
    }
  }
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: () => (
    <div className="max-w-sm">
      <p className="text-sm">Sekcja pierwsza</p>
      <Separator className="my-3" />
      <p className="text-sm">Sekcja druga</p>
    </div>
  )
};

export const Vertical: Story = {
  render: () => (
    <div className="flex h-6 items-center gap-3 text-sm">
      <span>Wina</span>
      <Separator orientation="vertical" />
      <span>Dania</span>
      <Separator orientation="vertical" />
      <span>Stoliki</span>
    </div>
  )
};
