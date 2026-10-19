import type { Meta, StoryObj } from '@storybook/react-vite';
import { Alert, AlertDescription, AlertTitle } from '../components/alert';

const meta = {
  title: 'Komponenty/Alert',
  component: Alert,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: `Komunikat o stanie na ekranie (shadcn/ui). Każdy \`Alert\` ma \`role="alert"\`, więc czytnik ogłasza go od razu.

**Kiedy używać:** wynik akcji, który użytkownik musi zobaczyć (zapisano, nie udało się zapisać), problem blokujący dalszą pracę.

**Kiedy nie używać:** do informacji stałej na stronie (użyj zwykłego tekstu lub \`Card\`) – częste \`role="alert"\` zagłusza czytnik; do pustego ekranu (użyj \`EmptyState\`); do błędu jednego pola (użyj komunikatu przy polu z \`aria-describedby\`).

**Stany**
- domyślny (\`default\`) – neutralny komunikat na tle \`card\`;
- hover / focus – nie dotyczy, chyba że w środku jest link lub przycisk (wtedy ich własne);
- disabled – nie dotyczy;
- błąd (\`destructive\`) – czerwony tekst i obramowanie; treść nazywa problem i co zrobić dalej.
- pusty – nie dotyczy.`
      }
    }
  }
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Alert className="max-w-xl">
      <AlertTitle>Import zapisany</AlertTitle>
      <AlertDescription>Dodano 42 wina. Pominięto 3 wiersze bez ceny.</AlertDescription>
    </Alert>
  )
};

export const Destructive: Story = {
  render: () => (
    <Alert variant="destructive" className="max-w-xl">
      <AlertTitle>Nie udało się opublikować karty</AlertTitle>
      <AlertDescription>Dwa dania nie mają przypisanego wina. Uzupełnij je i spróbuj ponownie.</AlertDescription>
    </Alert>
  )
};
