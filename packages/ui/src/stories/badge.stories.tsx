import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from '../components/badge';

const meta = {
  title: 'Komponenty/Badge',
  component: Badge,
  tags: ['autodocs'],
  args: { children: 'Nowe' },
  parameters: {
    docs: {
      description: {
        component: `Krótka etykieta statusu lub liczby (shadcn/ui).

**Kiedy używać:** status rekordu obok tytułu (np. „Szkic”, „Opublikowane”), licznik w nagłówku sekcji.

**Kiedy nie używać:** jako przycisk albo link do akcji (użyj \`Button\`); do długiego tekstu (ponad jedno–dwa słowa); do komunikatu o błędzie (użyj \`Alert\`) – sam kolor nie przenosi znaczenia.

**Stany**
- domyślny – wypełnienie wariantem;
- hover – tylko gdy badge jest linkiem (\`a\`): zmiana tła wariantu;
- focus – nie dotyczy, chyba że badge jest linkiem (wtedy ring przy \`focus-visible\`);
- disabled – nie dotyczy (badge nie jest kontrolką);
- błąd / pusty – nie dotyczy; wariant \`destructive\` oznacza problem, ale treść musi go nazwać słowami.`
      }
    }
  }
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="default">Opublikowane</Badge>
      <Badge variant="secondary">Szkic</Badge>
      <Badge variant="outline">Do przeglądu</Badge>
      <Badge variant="destructive">Brak ceny</Badge>
      <Badge variant="ghost">Archiwum</Badge>
      <Badge variant="link">Zobacz wszystkie</Badge>
    </div>
  )
};
