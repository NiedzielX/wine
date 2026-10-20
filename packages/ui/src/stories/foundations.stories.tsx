import type { Meta, StoryObj } from '@storybook/react-vite';
import styles from '../styles.css?raw';
import { buildRows, TEXT_MIN, UI_MIN, type Kind } from './contrast';

const KIND_LABEL: Record<Kind, string> = {
  text: `tekst (${TEXT_MIN}:1)`,
  ui: `granica i fokus (${UI_MIN}:1)`,
  surface: 'powierzchnia (bez progu)',
  decoration: 'dekoracja (bez progu)'
};

function Swatch({ hex }: { hex: string | null }) {
  if (!hex) return <span>-</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-block size-4 rounded border border-border" style={{ backgroundColor: hex }} aria-hidden="true" />
      <span className="font-mono text-xs">{hex}</span>
    </span>
  );
}

/** Token table: values and contrast read from src/styles.css at build time, never typed by hand. */
function Foundations() {
  const rows = buildRows(styles);
  const checked = rows.filter((r) => r.passes !== null);
  const failing = checked.filter((r) => r.passes === false);
  return (
    <div className="grid max-w-5xl gap-6">
      <section className="grid gap-2">
        <h1 className="text-2xl font-semibold">Tokeny kolorów panelu</h1>
        <p className="text-sm text-muted-foreground">
          Wartości z <code>src/styles.css</code> (<code>:root</code> i <code>.dark</code>). Kontrast wzorem WCAG 2.x:
          token <code>*-foreground</code> względem swojej powierzchni, pozostałe względem tła motywu. Progi: tekst{' '}
          {TEXT_MIN}:1, granica pola i pierścień fokusu {UI_MIN}:1 (WCAG 1.4.3, 1.4.11).
        </p>
        <p className="text-sm">
          <strong>Wynik:</strong> sprawdzono {checked.length} tokenów z progiem, poniżej progu: {failing.length}
          {failing.length > 0 ? ` (${failing.map((r) => r.name).join(', ')})` : ''}.
        </p>
      </section>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Tokeny kolorów z kontrastem w motywie jasnym i ciemnym</caption>
          <thead className="bg-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Token</th>
              <th scope="col" className="px-3 py-2 font-medium">Rola i tło</th>
              <th scope="col" className="px-3 py-2 font-medium">Jasny: wartość</th>
              <th scope="col" className="px-3 py-2 font-medium">Jasny: kontrast</th>
              <th scope="col" className="px-3 py-2 font-medium">Ciemny: wartość</th>
              <th scope="col" className="px-3 py-2 font-medium">Ciemny: kontrast</th>
              <th scope="col" className="px-3 py-2 font-medium">Wynik</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t">
                <td className="px-3 py-2 font-mono text-xs">--{r.name}</td>
                <td className="px-3 py-2">
                  {KIND_LABEL[r.role.kind]}
                  <div className="text-xs text-muted-foreground">
                    względem: {r.role.against === 'background' ? 'tło motywu' : r.role.against}
                  </div>
                </td>
                <td className="px-3 py-2"><Swatch hex={r.light} /></td>
                <td className="px-3 py-2 tabular-nums">{r.lightRatio.toFixed(2)}:1</td>
                <td className="px-3 py-2"><Swatch hex={r.dark} /></td>
                <td className="px-3 py-2 tabular-nums">{r.darkRatio === null ? '-' : `${r.darkRatio.toFixed(2)}:1`}</td>
                <td className="px-3 py-2">{r.passes === null ? 'bez progu' : r.passes ? 'OK' : 'poniżej progu'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const meta = {
  title: 'Foundations/Tokeny kolorów',
  component: Foundations,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `Tabela tokenów z \`src/styles.css\` z kontrastem na tle, liczona z pliku CSS przez \`contrast.ts\` (ten sam kod testuje \`tests/a11y.test.tsx\`). Przełącznik motywu w toolbarze zmienia podgląd; tabela pokazuje oba motywy naraz.

„Poniżej progu” to wynik pomiaru, a nie błąd renderowania: taki token wymaga decyzji o kolorze w \`styles.css\`.`
      }
    }
  }
} satisfies Meta<typeof Foundations>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Tokens: Story = {};
