import type { Meta, StoryObj } from '@storybook/react-vite';
import { MatchGlass } from '../brand/match-glass';

const meta = {
  title: 'Marka/MatchGlass',
  component: MatchGlass,
  tags: ['autodocs'],
  args: { score: 72, colour: '#7d2234', label: (n: number) => `Dopasowanie ${n} procent` },
  parameters: {
    docs: {
      description: {
        component: `Znak marki Wine Match: kieliszek wypełniony do poziomu dopasowania, w kolorze wina. Czysty SVG i Tailwind, bez shadcn, więc działa i na stronach gościa, i w panelu.

**Kiedy używać:** obok wyniku dopasowania wina do dania (pokazuje wynik silnika, bez podbijania).

**Kiedy nie używać:** jako ozdoba bez wyniku; zamiast liczby (procent zawsze podaj w tekście obok); do ocen, które nie są wynikiem silnika (np. ocena sommeliera).

**Stany**
- domyślny – wypełnienie do \`score\` w kolorze \`colour\` (przycinane do 0–100);
- hover / focus / disabled – nie dotyczy (element nie jest interaktywny);
- błąd – nie dotyczy: brak wyniku nie pokazuje pustego kieliszka, tylko brak elementu (zob. wyjaśnienie na ekranie);
- pusty (0) – kieliszek bez wypełnienia; etykieta dla czytnika podawana przez \`label\`.

Kolor wina podaje wywołujący; komponent nie ma własnego motywu.`
      }
    }
  }
} satisfies Meta<typeof MatchGlass>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: { score: 0, label: (n: number) => `Dopasowanie ${n} procent` }
};

export const Full: Story = {
  args: { score: 100, colour: '#5a1a2c', size: 64, label: (n: number) => `Dopasowanie ${n} procent` }
};
