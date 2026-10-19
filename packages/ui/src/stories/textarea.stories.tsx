import { useId } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Label } from '../components/label';
import { Textarea } from '../components/textarea';

function Field({ label, error, ...props }: React.ComponentProps<'textarea'> & { label: string; error?: string }) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="grid w-full max-w-md gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} {...props} />
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const meta = {
  title: 'Komponenty/Textarea',
  component: Textarea,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: `Wieloliniowe pole tekstu (shadcn/ui), rośnie z treścią (\`field-sizing-content\`). Zawsze z \`Label\`.

**Kiedy używać:** opis, notatka sommeliera, uzasadnienie zmiany, dłuższa wiadomość.

**Kiedy nie używać:** do jednej wartości (użyj \`Input\`); do treści formatowanej (potrzebny edytor, nie pole zwykłe).

**Stany**
- domyślny – obramowanie \`input\`, tło przezroczyste;
- hover – bez zmiany (w ciemnym motywie \`input/50\` tła);
- focus – obwódka \`ring\` i poświata 3 px przy \`focus-visible\`;
- disabled – 50% krycia, brak fokusu;
- błąd – \`aria-invalid\`, obramowanie \`destructive\`, komunikat przez \`aria-describedby\`; pusty stan nie dotyczy pola (pusta notatka jest poprawna, chyba że pole jest wymagane).`
      }
    }
  }
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <Field label="Notatka dla kelnera" placeholder="Np. bez siarki, podawać schłodzone" />
};

export const Focus: Story = {
  render: () => <Field label="Notatka dla kelnera" defaultValue="Podawać w kieliszku ISO." />,
  play: async ({ canvasElement }) => {
    canvasElement.querySelector('textarea')?.focus();
  }
};

export const Disabled: Story = {
  render: () => <Field label="Notatka (zablokowana)" defaultValue="Zamknięte po publikacji." disabled />
};

export const Error: Story = {
  render: () => <Field label="Uzasadnienie" defaultValue="" error="Podaj uzasadnienie zmiany, to pole jest wymagane." required />
};
