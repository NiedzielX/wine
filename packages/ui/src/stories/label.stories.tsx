import { useId } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from '../components/input';
import { Label } from '../components/label';

const meta = {
  title: 'Komponenty/Label',
  component: Label,
  tags: ['autodocs'],
  args: { children: 'Nazwa wina' },
  parameters: {
    docs: {
      description: {
        component: `Etykieta pola (shadcn/ui, oparta na Radix). Zawsze połączona z polem przez \`htmlFor\`, żeby kliknięcie i czytnik ekranu trafiały w pole.

**Kiedy używać:** przy każdym polu formularza, także przy polu wyszukiwania (może być wizualnie ukryta, ale nie może zniknąć z drzewa dostępności).

**Kiedy nie używać:** jako nagłówek sekcji (użyj nagłówka); do opisu pola (użyj tekstu pomocniczego z \`aria-describedby\`); zamiast placeholdera.

**Stany**
- domyślny – tekst \`text-sm\`, pogrubienie \`font-medium\`;
- hover / focus – etykieta nie reaguje; fokus jest na polu;
- disabled – 50% krycia, gdy rodzic ma \`data-disabled="true"\` (klasa \`group\`) albo pole obok ma \`peer\` i jest zablokowane;
- błąd / pusty – etykieta nie pokazuje błędu; komunikat jest osobnym tekstem pod polem.`
      }
    }
  }
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    const id = useId();
    return (
      <div className="grid max-w-sm gap-2">
        <Label htmlFor={id}>Nazwa wina</Label>
        <Input id={id} placeholder="np. Riesling Spätlese" />
      </div>
    );
  }
};

export const Disabled: Story = {
  render: () => {
    const id = useId();
    return (
      <div className="group grid max-w-sm gap-2" data-disabled="true">
        <Label htmlFor={id}>Nazwa wina (zablokowana)</Label>
        <Input id={id} defaultValue="Riesling Spätlese" disabled />
      </div>
    );
  }
};
