import { useId } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from '../components/input';
import { Label } from '../components/label';

/** Label and input paired with `htmlFor`; the id comes from `useId`, so several stories can share one page. */
function Field({ label, error, ...props }: React.ComponentProps<'input'> & { label: string; error?: string }) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="grid w-full max-w-sm gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} {...props} />
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const meta = {
  title: 'Komponenty/Input',
  component: Input,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: `Jednowierszowe pole tekstowe (shadcn/ui). Zawsze z \`Label\` (\`htmlFor\`); placeholder nie zastępuje etykiety.

**Kiedy używać:** krótki tekst, liczba, e-mail, wyszukiwanie w panelu.

**Kiedy nie używać:** do wielu linii (użyj \`Textarea\`); do wyboru z listy wartości (użyj \`NativeSelect\`); do hasła bez potwierdzenia i pokazania wymagań.

**Stany**
- domyślny – obramowanie \`input\` (granica kontrolki, kontrast 3:1, patrz Foundations);
- hover – bez zmiany w \`Input\` (w ciemnym motywie tło \`input/50\`);
- focus – obwódka \`ring\` i poświata 3 px przy \`focus-visible\` (pole zyskuje fokus z klawiatury lub kliknięcia);
- disabled – 50% krycia, kursor niedozwolony, brak fokusu;
- błąd – \`aria-invalid="true"\`, obramowanie \`destructive\`, tekst błędu połączony przez \`aria-describedby\`; pusty stan nie dotyczy pola.`
      }
    }
  }
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <Field label="Nazwa wina" placeholder="np. Pinot Noir Reserve" />
};

/** Focus is set on the input when the story opens. */
export const Focus: Story = {
  render: () => <Field label="Nazwa wina" defaultValue="Pinot Noir" />,
  play: async ({ canvasElement }) => {
    canvasElement.querySelector('input')?.focus();
  }
};

export const Disabled: Story = {
  render: () => <Field label="Rocznik (zablokowany)" defaultValue="2019" disabled />
};

export const Error: Story = {
  render: () => <Field label="Cena w zł" defaultValue="-20" error="Cena nie może być ujemna." />
};
