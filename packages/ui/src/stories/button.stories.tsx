import type { Meta, StoryObj } from '@storybook/react-vite';
import { Trash2 } from 'lucide-react';
import { Button } from '../components/button';

const meta = {
  title: 'Komponenty/Button',
  component: Button,
  tags: ['autodocs'],
  args: { children: 'Zapisz zmiany' },
  parameters: {
    docs: {
      description: {
        component: `Przycisk akcji (shadcn/ui).

**Kiedy używać:** akcja, która zmienia dane albo otwiera kolejny krok (zapisz, dodaj, publikuj, potwierdź); jedna główna akcja na ekranie (\`default\`), reszta jako \`outline\` lub \`ghost\`.

**Kiedy nie używać:** do nawigacji między stronami (użyj linku, żeby działał i otwierał się w nowej karcie); do przełącznika dwustanowego (użyj checkboxa lub przełącznika); jako etykiety statusu (użyj \`Badge\`).

**Stany**
- domyślny – wariant zgodny z rolą akcji;
- hover – \`default\` i \`secondary\` ciemnieją (\`/90\`, \`/80\`), \`outline\` i \`ghost\` dostają tło \`accent\`;
- focus – obwódka \`ring\` 3 px przy \`focus-visible\` (widoczna przy nawigacji klawiaturą, Tab); klik myszą jej nie pokazuje;
- disabled – 50% krycia, brak reakcji na kliknięcie;
- błąd / pusty – nie dotyczy: przycisk nie pokazuje błędu, komunikat daje formularz lub \`ErrorMessage\`.

Przycisk bez tekstu (\`size="icon"\`) wymaga \`aria-label\`.`
      }
    }
  }
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button variant="default">Dodaj wino</Button>
      <Button variant="secondary">Anuluj</Button>
      <Button variant="outline">Filtruj</Button>
      <Button variant="ghost">Pokaż więcej</Button>
      <Button variant="link">Dowiedz się więcej</Button>
      <Button variant="destructive">Usuń kartę</Button>
    </div>
  )
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="xs">Extra small</Button>
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
    </div>
  )
};

/** Focus is set on the first button when the story opens; Tab moves it, and the ring stays visible for keyboard focus. */
export const Focus: Story = {
  play: async ({ canvasElement }) => {
    canvasElement.querySelector('button')?.focus();
  }
};

export const Disabled: Story = {
  args: { disabled: true }
};

export const IconOnly: Story = {
  args: {
    size: 'icon',
    variant: 'outline',
    'aria-label': 'Usuń wino z karty',
    children: <Trash2 />
  }
};
