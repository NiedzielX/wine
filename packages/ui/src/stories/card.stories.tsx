import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../components/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/card';

const meta = {
  title: 'Komponenty/Card',
  component: Card,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: `Kontener treści z nagłówkiem, zawartością i stopką (shadcn/ui).

**Kiedy używać:** grupa powiązanych danych na ekranie panelu (podsumowanie, ustawienia, pojedynczy rekord).

**Kiedy nie używać:** jako klikalny kafelek (karta nie jest linkiem ani przyciskiem – użyj linku w środku); do zagnieżdżania kart w kartach; do stanu pustego całego ekranu (użyj \`EmptyState\`).

**Stany**
- domyślny – tło \`card\`, obramowanie \`border\` (dekoracja, nie granica kontrolki);
- hover / focus – karta sama ich nie ma; interaktywne elementy wewnątrz mają własne;
- disabled – nie dotyczy;
- błąd / pusty – karta bez treści pokazuje tekst „brak danych” w \`CardContent\`; pełny stan pusty daje \`EmptyState\`.`
      }
    }
  }
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Pinot Noir, Burgundia</CardTitle>
        <CardDescription>Do dań z kaczką i łososiem.</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm">Edytuj</Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm">Match 86%. Para zatwierdzona przez sommeliera.</p>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="outline" size="sm">Anuluj</Button>
        <Button size="sm">Zapisz</Button>
      </CardFooter>
    </Card>
  )
};

export const EmptyContent: Story = {
  render: () => (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Kieliszki</CardTitle>
        <CardDescription>Brak zdefiniowanych kieliszków dla tego wina.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Brak danych. Dodaj kieliszek, aby pokazać go gościom.</p>
      </CardContent>
    </Card>
  )
};
