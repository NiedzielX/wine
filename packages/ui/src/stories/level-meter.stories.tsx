import type { Meta, StoryObj } from '@storybook/react-vite';
import { LevelMeter } from '../components/level-meter';

const meta = {
  title: 'Komponenty/LevelMeter',
  component: LevelMeter,
  tags: ['autodocs'],
  args: { value: 3, label: (v: number) => `${v} z 5` },
  parameters: {
    docs: {
      description: {
        component: `Skala 0–5 jako pięć kropek (np. intensywność smaku, taniny). Całość to \`role="img"\` z etykietą; kropki są ukryte przed czytnikiem.

**Kiedy używać:** krótka, uporządkowana ocena cechy wina w karcie produktu lub w panelu sommeliera.

**Kiedy nie używać:** do wyniku dopasowania (Match Score ma własny komponent \`MatchGlass\` i procent); do wartości z dużą dokładnością (np. 3,7 – zaokrąglane do całości); bez etykiety w języku strony.

**Stany**
- domyślny – wypełnione kropki \`primary\`, puste \`border\`;
- hover / focus / disabled – nie dotyczy (element nie jest interaktywny);
- błąd – nie dotyczy: wartość spoza 0–5 jest przycinana;
- pusty (0) – same puste kropki, czytnik ogłasza „0 z 5”.

Etykieta podawana przez \`label\` (np. \`"3 z 5"\` po polsku).`
      }
    }
  }
} satisfies Meta<typeof LevelMeter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: { value: 0 }
};

export const Full: Story = {
  args: { value: 5, label: (v: number) => `${v} z 5` }
};
