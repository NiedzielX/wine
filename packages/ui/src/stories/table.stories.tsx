import type { Meta, StoryObj } from '@storybook/react-vite';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '../components/table';

const meta = {
  title: 'Komponenty/Table',
  component: Table,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: `Tabela danych w panelu (shadcn/ui), z przewijaniem poziomym w kontenerze.

**Kiedy używać:** zestawienie wielu rekordów o tych samych polach (lista win, importowane pozycje), które użytkownik chce porównać.

**Kiedy nie używać:** do układu strony lub formularza (użyj siatki i \`Label\`); do kilku wartości jednego rekordu (użyj listy definicji lub \`Card\`); na telefonie gościa – tam obowiązuje układ kartowy.

**Stany**
- domyślny – nagłówki \`th\` i wiersze z separatorami;
- hover – podświetlenie wiersza (\`hover:bg-muted/50\`); nie jest jedynym sygnałem, wiersz ma treść;
- focus – nie dotyczy, chyba że komórki zawierają linki (wtedy ring przy \`focus-visible\`);
- disabled – nie dotyczy;
- błąd / pusty – pusta tabela pokazuje jeden wiersz z komunikatem (wariant „Pusta”), nie zostawia pustego ciała.

Nagłówki muszą być komórkami \`th\`, a tabela z opisem ma \`TableCaption\`.`
      }
    }
  }
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Table>
      <TableCaption>Wina na karcie, ostatnia publikacja</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Wino</TableHead>
          <TableHead>Region</TableHead>
          <TableHead className="text-right">Cena</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Pinot Noir</TableCell>
          <TableCell>Burgundia</TableCell>
          <TableCell className="text-right">189 zł</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Riesling Spätlese</TableCell>
          <TableCell>Mozela</TableCell>
          <TableCell className="text-right">142 zł</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  )
};

export const Empty: Story = {
  render: () => (
    <Table>
      <TableCaption>Wina na karcie</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Wino</TableHead>
          <TableHead>Region</TableHead>
          <TableHead className="text-right">Cena</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell colSpan={3} className="text-center text-muted-foreground">
            Brak win na karcie. Zaimportuj listę win, aby ją zobaczyć.
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  )
};
