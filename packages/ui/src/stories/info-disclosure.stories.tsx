import type { Meta, StoryObj } from '@storybook/react-vite';
import { InfoDisclosure } from '../brand/info-disclosure';

const meta = {
  title: 'Marka/InfoDisclosure',
  component: InfoDisclosure,
  tags: ['autodocs'],
  args: {
    summary: 'Dlaczego te wina?',
    explainId: 'wines',
    children: <p className="text-sm">Wina są ułożone według dopasowania do dania i Twoich preferencji.</p>
  },
  parameters: {
    docs: {
      description: {
        component: `Wyjaśnienie „jak to działa”: natywny \`<details>\`/\`<summary>\`. Działa bez JavaScriptu, otwiera się kliknięciem, Enterem lub Spacją, stan ogłasza przeglądarka. Brak \`title\` i hovera.

**Kiedy używać:** jedno krótkie pytanie przy wyniku, które wyjaśnia regułę (np. skąd wynik). Na ekranie gościa – jedno na ekran.

**Kiedy nie używać:** do treści z linkami, przyciskami lub nagłówkami (\`summary\` ma być zwykłym tekstem); do ostrzeżeń, które muszą być widoczne (użyj \`Alert\`); jako jedyne miejsce, gdzie jest ważna informacja.

**Stany**
- domyślny (zamknięty) – ikona „i” i pytanie; treść ukryta;
- hover – kursor pointer; bez zmiany koloru (kolor z klas wywołującego);
- focus – obwódka fokusu na \`summary\` przy \`focus-visible\` (klasy wywołującego, w panelu \`outline-2\`);
- otwarty (\`open\`) – treść w zwykłym przepływie strony, nie nad inną treścią;
- disabled – nie dotyczy;
- błąd / pusty – nie dotyczy.

Wariant \`compact\` pokazuje tylko ikonę; pytanie zostaje nazwą dostępną (\`sr-only\`).`
      }
    }
  }
} satisfies Meta<typeof InfoDisclosure>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

export const Open: Story = {
  args: { open: true }
};

export const Compact: Story = {
  args: { compact: true, summary: 'Jak gość widzi Twoje dopasowania' }
};

/** Focus is set on the summary when the story opens; Enter or Space toggles it. */
export const Focus: Story = {
  play: async ({ canvasElement }) => {
    canvasElement.querySelector('summary')?.focus();
  }
};
