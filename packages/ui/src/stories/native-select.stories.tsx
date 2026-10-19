import { useId } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Label } from '../components/label';
import { NativeSelect, NativeSelectOption } from '../components/native-select';

function Field({ label, error, children, ...props }: React.ComponentProps<typeof NativeSelect> & { label: string; error?: string }) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="grid w-full max-w-sm gap-2">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect id={id} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} {...props}>
        {children}
      </NativeSelect>
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const meta = {
  title: 'Komponenty/NativeSelect',
  component: NativeSelect,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: `Natywny \`<select>\` w stylu panelu (shadcn/ui). Zostawiamy natywny element, bo działa z klawiaturą, na telefonie i w czytniku ekranu bez dodatkowego kodu.

**Kiedy używać:** wybór jednej wartości z krótkiej, znanej listy (kolor, rozmiar porcji, typ wina).

**Kiedy nie używać:** do listy dłuższej niż kilkanaście pozycji albo z wyszukiwaniem (potrzebny combobox); do wyboru wielu wartości (użyj checkboxów).

**Stany**
- domyślny – strzałka po prawej, obramowanie \`input\`;
- hover – w ciemnym motywie tło \`input/50\`; w jasnym bez zmiany;
- focus – obwódka \`ring\` i poświata 3 px przy \`focus-visible\`;
- disabled – 50% krycia (wrapper), brak reakcji;
- błąd – \`aria-invalid\`, obramowanie \`destructive\`, komunikat przez \`aria-describedby\`; pusty stan: lista bez opcji to błąd konfiguracji, nie stan UI – wtedy pokaż \`EmptyState\` zamiast pola.`
      }
    }
  }
} satisfies Meta<typeof NativeSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Field label="Typ wina" defaultValue="red">
      <NativeSelectOption value="red">Czerwone</NativeSelectOption>
      <NativeSelectOption value="white">Białe</NativeSelectOption>
      <NativeSelectOption value="rose">Różowe</NativeSelectOption>
    </Field>
  )
};

export const Focus: Story = {
  render: () => (
    <Field label="Typ wina" defaultValue="white">
      <NativeSelectOption value="red">Czerwone</NativeSelectOption>
      <NativeSelectOption value="white">Białe</NativeSelectOption>
    </Field>
  ),
  play: async ({ canvasElement }) => {
    canvasElement.querySelector('select')?.focus();
  }
};

export const Disabled: Story = {
  render: () => (
    <Field label="Typ wina (zablokowany)" defaultValue="red" disabled>
      <NativeSelectOption value="red">Czerwone</NativeSelectOption>
    </Field>
  )
};

export const Error: Story = {
  render: () => (
    <Field label="Kieliszek" defaultValue="" error="Wybierz rozmiar kieliszka." required>
      <NativeSelectOption value="" disabled>
        Wybierz
      </NativeSelectOption>
      <NativeSelectOption value="125">125 ml</NativeSelectOption>
      <NativeSelectOption value="150">150 ml</NativeSelectOption>
    </Field>
  )
};

export const SmallSize: Story = {
  render: () => (
    <Field label="Rocznik" defaultValue="2019" size="sm">
      <NativeSelectOption value="2019">2019</NativeSelectOption>
      <NativeSelectOption value="2020">2020</NativeSelectOption>
    </Field>
  )
};
